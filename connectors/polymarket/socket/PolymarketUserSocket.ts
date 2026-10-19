/**
 * @fileoverview Polymarket CLOB user channel — the authenticated
 * account's own order and trade events.
 *
 * Wire protocol (docs.polymarket.com → User Channel):
 *
 * - On every new connection send `{ auth: { apiKey, secret, passphrase },
 *   type: 'user', markets? }`. The credentials are the CLOB L2 API
 *   credentials — the same object the REST client takes as
 *   `auth.apiCredentials`. No signature or timestamp; the server checks
 *   the triple directly. Omitting `markets` streams every market.
 * - `{ operation: 'subscribe' | 'unsubscribe', markets }` changes the
 *   condition-id filter while connected.
 * - Heartbeat: text `PING` every 10s, answered with `PONG`. The channel
 *   can be quiet for long stretches between fills, so `PONG` is the
 *   liveness signal — there is no data watchdog by default.
 *
 * Every message is delivered: a trade appears once per lifecycle status
 * (MATCHED, MINED, CONFIRMED, ...), never de-duplicated. The channel does
 * not replay what was missed while disconnected — after a `connected`
 * event with `reconnected: true`, reconcile open orders and recent trades
 * over REST.
 *
 * KEY CUSTODY: the API secret is sent to Polymarket in the auth frame, so
 * it must be held in this process as plain text — an injected HMAC signer
 * can't stand in for it here. It lives in a `#private` field and is never
 * logged or put in an error.
 *
 * @module
 */

import { PolymarketError } from '../errors/mod.ts';
import type { PolymarketErrorCode } from '../errors/mod.ts';
import {
  type ClobApiCredentials,
  type PolymarketUserOrder,
  PolymarketUserOrderSchemaObject,
  type PolymarketUserTrade,
  PolymarketUserTradeSchemaObject,
} from '../schema/mod.ts';
import {
  type FeedDataEvent,
  type FeedLifecycleEvent,
  FeedSocket,
  type FeedSocketErrorCode,
  type FeedSocketOptions,
} from './FeedSocket.ts';

/** Production user-channel URL. */
export const POLYMARKET_USER_WS_URL =
  'wss://ws-subscriptions-clob.polymarket.com/ws/user';

/** Options for {@link PolymarketUserSocket}. */
export type PolymarketUserSocketOptions = FeedSocketOptions & {
  /**
   * Credentials. Pass the same `auth` object as the REST `Polymarket`
   * client (only `apiCredentials` is read).
   */
  auth: { apiCredentials?: ClobApiCredentials };
  /** Condition ids to filter to. Omit for every market on the account. */
  markets?: string[];
};

/** Every event a {@link PolymarketUserSocket} yields besides the lifecycle ones. */
export type PolymarketUserEvent =
  | FeedDataEvent<'order', PolymarketUserOrder>
  | FeedDataEvent<'trade', PolymarketUserTrade>;

/** Everything iterating a {@link PolymarketUserSocket} can yield. */
export type PolymarketUserSocketEvent =
  | PolymarketUserEvent
  | FeedLifecycleEvent<PolymarketError>;

/**
 * Authenticated Polymarket order/trade feed.
 *
 * @example
 * ```ts
 * import { PolymarketUserSocket } from '@tundraconnect/polymarket/sockets';
 *
 * const socket = new PolymarketUserSocket({
 *   auth: {
 *     apiCredentials: { apiKey: '<key>', secret: '<secret>', passphrase: '<passphrase>' },
 *   },
 * });
 * for await (const event of socket) {
 *   if (event.type === 'trade') console.log(event.data.status, event.data.size);
 * }
 * ```
 */
export class PolymarketUserSocket
  extends FeedSocket<PolymarketUserEvent, PolymarketError> {
  public readonly feed = 'polymarket-user';
  readonly #credentials: ClobApiCredentials;
  readonly #markets = new Set<string>();

  /**
   * @throws {PolymarketError} `SOCKET_MISSING_CREDENTIALS` when
   * `auth.apiCredentials` is absent.
   */
  constructor(options: PolymarketUserSocketOptions) {
    super({
      heartbeatIntervalMs: 10_000,
      idleTimeoutMs: 30_000,
      ...options,
    });
    const creds = options.auth?.apiCredentials;
    if (!creds?.apiKey || !creds.secret || !creds.passphrase) {
      throw new PolymarketError('SOCKET_MISSING_CREDENTIALS', {
        feed: this.feed,
      });
    }
    this.#credentials = { ...creds };
    for (const m of options.markets ?? []) this.#markets.add(m);
  }

  /** Condition ids currently filtered to (empty: every market). */
  public get markets(): string[] {
    return [...this.#markets];
  }

  /** Add condition ids to the filter. */
  public subscribe(markets: string[]): void {
    const added = markets.filter((m) => {
      if (this.#markets.has(m)) return false;
      this.#markets.add(m);
      return true;
    });
    if (added.length === 0) return;
    this._send(JSON.stringify({ operation: 'subscribe', markets: added }));
  }

  /** Remove condition ids from the filter. */
  public unsubscribe(markets: string[]): void {
    const removed = markets.filter((m) => this.#markets.delete(m));
    if (removed.length === 0) return;
    this._send(JSON.stringify({ operation: 'unsubscribe', markets: removed }));
  }

  protected _error(
    code: FeedSocketErrorCode | PolymarketErrorCode,
    meta?: Record<string, unknown>,
    cause?: Error,
  ): PolymarketError {
    return new PolymarketError(code, meta, cause);
  }

  protected _url(): string {
    return this._options.url ?? POLYMARKET_USER_WS_URL;
  }

  protected _onOpen(): void {
    const { apiKey, secret, passphrase } = this.#credentials;
    this._send(JSON.stringify({
      auth: { apiKey, secret, passphrase },
      type: 'user',
      ...(this.#markets.size > 0 && { markets: [...this.#markets] }),
    }));
  }

  protected override _heartbeat(): void {
    this._send('PING');
  }

  protected _onText(text: string, receivedAt: number): boolean {
    const trimmed = text.trim();
    if (trimmed === 'PONG' || trimmed === 'pong' || trimmed === '') {
      return false;
    }
    if (trimmed === 'PING') {
      this._send('PONG');
      return false;
    }
    const base = this._base(receivedAt, text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      this._emitError(
        this._error('SOCKET_VENUE_ERROR', { feed: this.feed, detail: trimmed }),
        receivedAt,
      );
      return false;
    }
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      const eventType = (item as { event_type?: unknown } | null)?.event_type;
      if (eventType === 'order') {
        const data = this._parse(
          PolymarketUserOrderSchemaObject,
          item,
          'order',
          base,
        );
        if (data) {
          this._emit({
            ...base,
            type: 'order',
            venueTimestamp: data.timestamp,
            data,
          });
        }
      } else if (eventType === 'trade') {
        const data = this._parse(
          PolymarketUserTradeSchemaObject,
          item,
          'trade',
          base,
        );
        if (data) {
          this._emit({
            ...base,
            type: 'trade',
            venueTimestamp: data.timestamp,
            data,
          });
        }
      } else {
        this._emit({ ...base, type: 'unknown', data: item });
      }
    }
    return true;
  }
}
