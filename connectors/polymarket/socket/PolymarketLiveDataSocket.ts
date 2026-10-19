/**
 * @fileoverview Polymarket's legacy real-time data socket
 * (`wss://ws-live-data.polymarket.com`) — Chainlink and Binance crypto
 * reference prices, no credentials.
 *
 * Wire protocol (confirmed against the live feed):
 *
 * - `{ action: 'subscribe' | 'unsubscribe', subscriptions: [{ topic, type,
 *   filters }] }`. Topics: `crypto_prices_chainlink` (symbols like
 *   `btc/usd`) and `crypto_prices` (Binance, symbols like `btcusdt`).
 * - The server can only filter one symbol per topic and a second
 *   subscription on the same topic replaces the first, so the socket
 *   subscribes each topic unfiltered and filters symbols client-side when
 *   you name them.
 * - Heartbeat: text `PING` every 5s. The relay does not answer it, so
 *   liveness is the price data itself — a data watchdog is on by default.
 *
 * Polymarket has deprecated these price topics in favour of PolyBolt
 * ({@link PolymarketPriceSocket}), which serves Chainlink (and Pyth) but
 * not Binance. Until the legacy topics are switched off, this is the only
 * Polymarket feed for its Binance reference prices.
 *
 * @module
 */

import { PolymarketError } from '../errors/mod.ts';
import type { PolymarketErrorCode } from '../errors/mod.ts';
import {
  type PolymarketLiveDataPrice,
  PolymarketLiveDataPriceSchemaObject,
} from '../schema/mod.ts';
import {
  type FeedDataEvent,
  type FeedLifecycleEvent,
  FeedSocket,
  type FeedSocketErrorCode,
  type FeedSocketOptions,
} from './FeedSocket.ts';

/** Legacy real-time data socket URL. */
export const POLYMARKET_LIVE_DATA_WS_URL = 'wss://ws-live-data.polymarket.com';

/** A price source on the legacy real-time data socket. */
export type PolymarketLiveDataSource = 'chainlink' | 'binance';

const TOPICS: Record<
  PolymarketLiveDataSource,
  { topic: string; type: string }
> = {
  chainlink: { topic: 'crypto_prices_chainlink', type: '*' },
  binance: { topic: 'crypto_prices', type: 'update' },
};

/** Options for {@link PolymarketLiveDataSocket}. */
export type PolymarketLiveDataSocketOptions = FeedSocketOptions & {
  /**
   * Sources to subscribe to from the start, each with the wire symbols to
   * keep (`['btc/usd']`, `['btcusdt']`) or `'all'`.
   */
  sources?: Partial<Record<PolymarketLiveDataSource, string[] | 'all'>>;
};

/** A reference price. `source` names which feed it came from. */
export type PolymarketLiveDataPriceEvent =
  & FeedDataEvent<'price', PolymarketLiveDataPrice>
  & { source: PolymarketLiveDataSource };

/** Everything iterating a {@link PolymarketLiveDataSocket} can yield. */
export type PolymarketLiveDataSocketEvent =
  | PolymarketLiveDataPriceEvent
  | FeedLifecycleEvent<PolymarketError>;

/**
 * Chainlink + Binance crypto prices from Polymarket's legacy real-time
 * data socket.
 *
 * @example
 * ```ts
 * import { PolymarketLiveDataSocket } from '@tundraconnect/polymarket/sockets';
 *
 * const socket = new PolymarketLiveDataSocket({
 *   sources: { chainlink: ['btc/usd'], binance: ['btcusdt'] },
 * });
 * for await (const event of socket) {
 *   if (event.type === 'price') {
 *     console.log(event.source, event.data.payload.symbol, event.data.payload.value);
 *   }
 * }
 * ```
 */
export class PolymarketLiveDataSocket
  extends FeedSocket<PolymarketLiveDataPriceEvent, PolymarketError> {
  public readonly feed = 'polymarket-live-data';
  /** Per source: the lower-cased symbols to keep, or `null` for all. */
  readonly #sources = new Map<PolymarketLiveDataSource, Set<string> | null>();

  constructor(options: PolymarketLiveDataSocketOptions = {}) {
    super({
      heartbeatIntervalMs: 5_000,
      idleTimeoutMs: 30_000,
      dataTimeoutMs: 30_000,
      ...options,
    });
    for (const [source, symbols] of Object.entries(options.sources ?? {})) {
      if (symbols) {
        this.#sources.set(
          source as PolymarketLiveDataSource,
          symbols === 'all'
            ? null
            : new Set(symbols.map((s) => s.toLowerCase())),
        );
      }
    }
  }

  /**
   * Subscribe to a source — every symbol, or only `symbols` (wire form:
   * `btc/usd` for Chainlink, `btcusdt` for Binance). Calling again with
   * more symbols widens the filter; omitting `symbols` removes it.
   */
  public subscribe(
    source: PolymarketLiveDataSource,
    symbols?: string[],
  ): void {
    const had = this.#sources.has(source);
    const current = this.#sources.get(source);
    if (!symbols) this.#sources.set(source, null);
    else if (current !== null) {
      const set = current ?? new Set<string>();
      for (const s of symbols) set.add(s.toLowerCase());
      this.#sources.set(source, set);
    }
    if (!had) {
      this._touchData();
      this._send(JSON.stringify({
        action: 'subscribe',
        subscriptions: [{ ...TOPICS[source], filters: '' }],
      }));
    }
  }

  /** Drop `symbols` from a source's filter, or the whole source when omitted (or when none remain). */
  public unsubscribe(
    source: PolymarketLiveDataSource,
    symbols?: string[],
  ): void {
    const current = this.#sources.get(source);
    if (current === undefined) return;
    if (symbols && current) {
      for (const s of symbols) current.delete(s.toLowerCase());
      if (current.size > 0) return;
    } else if (symbols && current === null) {
      return; // Unfiltered: nothing to narrow.
    }
    this.#sources.delete(source);
    this._send(JSON.stringify({
      action: 'unsubscribe',
      subscriptions: [{ ...TOPICS[source], filters: '' }],
    }));
  }

  protected _error(
    code: FeedSocketErrorCode | PolymarketErrorCode,
    meta?: Record<string, unknown>,
    cause?: Error,
  ): PolymarketError {
    return new PolymarketError(code, meta, cause);
  }

  protected _url(): string {
    return this._options.url ?? POLYMARKET_LIVE_DATA_WS_URL;
  }

  protected _onOpen(): void {
    if (this.#sources.size === 0) return;
    this._send(JSON.stringify({
      action: 'subscribe',
      subscriptions: [...this.#sources.keys()].map((s) => ({
        ...TOPICS[s],
        filters: '',
      })),
    }));
  }

  protected override _heartbeat(): void {
    this._send('PING');
  }

  protected override _hasSubscriptions(): boolean {
    return this.#sources.size > 0;
  }

  protected _onText(text: string, receivedAt: number): boolean {
    const trimmed = text.trim();
    if (trimmed === '' || /^p[io]ng$/i.test(trimmed)) return false;
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
    const topic = (parsed as { topic?: unknown } | null)?.topic;
    const source = topic === TOPICS.chainlink.topic
      ? 'chainlink'
      : topic === TOPICS.binance.topic
      ? 'binance'
      : undefined;
    if (!source) {
      this._emit({ ...base, type: 'unknown', data: parsed });
      return true;
    }
    const filter = this.#sources.get(source);
    const symbol = (parsed as { payload?: { symbol?: unknown } }).payload
      ?.symbol;
    if (
      filter === undefined ||
      (filter !== null && typeof symbol === 'string' &&
        !filter.has(symbol.toLowerCase()))
    ) {
      return true; // A source or symbol you didn't ask for.
    }
    const data = this._parse(
      PolymarketLiveDataPriceSchemaObject,
      parsed,
      String(topic),
      base,
    );
    if (data) {
      this._emit({
        ...base,
        type: 'price',
        source,
        venueTimestamp: data.payload.timestamp,
        data,
      });
    }
    return true;
  }
}
