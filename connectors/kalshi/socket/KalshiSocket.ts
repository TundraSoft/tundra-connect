/**
 * @fileoverview Kalshi's authenticated WebSocket (`/trade-api/ws/v2`) —
 * order-book snapshots and deltas, public trades and tickers, and the
 * account's fills, order updates and positions, on one connection.
 *
 * Wire protocol (docs.kalshi.com → WebSockets):
 *
 * - Every connection is signed, even for public channels: the handshake
 *   carries `KALSHI-ACCESS-KEY`, `-TIMESTAMP` and `-SIGNATURE` over
 *   `{timestampMs}GET/trade-api/ws/v2` — the REST scheme with the WS path.
 *   Headers are rebuilt for every reconnect (the timestamp is part of the
 *   signature).
 * - Commands carry an incrementing `id`: `subscribe` (one channel per
 *   command here, so each `subscribed` ack maps to one `sid`),
 *   `unsubscribe` by `sids`, and `update_subscription` with `add_markets`
 *   / `delete_markets` / `get_snapshot`.
 * - Frames are `{ type, sid, seq?, msg, sending_ts_ms? }`. `seq` counts per
 *   `sid` and restarts with each connection; a jump is a `gap` (re-snapshot
 *   with {@link KalshiSocket.requestSnapshot}).
 * - The server sends WebSocket-level pings every 10s, which the runtime
 *   answers but cannot report, so this socket probes with
 *   `list_subscriptions` as its heartbeat: no reply means a dead
 *   connection.
 *
 * Every frame is delivered: snapshots and every delta at full depth, every
 * trade and fill.
 *
 * @module
 */

import { KalshiError } from '../errors/mod.ts';
import type { KalshiErrorCode } from '../errors/mod.ts';
import { signingString } from '../KalshiAuth.ts';
import { KalshiSigner } from '../KalshiSigner.ts';
import {
  type KalshiFeedFill,
  KalshiFeedFillSchemaObject,
  type KalshiFeedMarketPosition,
  KalshiFeedMarketPositionSchemaObject,
  type KalshiFeedTicker,
  KalshiFeedTickerSchemaObject,
  type KalshiFeedTrade,
  KalshiFeedTradeSchemaObject,
  type KalshiFeedUserOrder,
  KalshiFeedUserOrderSchemaObject,
  type KalshiOrderbookDelta,
  KalshiOrderbookDeltaSchemaObject,
  type KalshiOrderbookSnapshot,
  KalshiOrderbookSnapshotSchemaObject,
} from '../schema/mod.ts';
import {
  type FeedDataEvent,
  type FeedLifecycleEvent,
  FeedSocket,
  type FeedSocketErrorCode,
  type FeedSocketOptions,
} from './FeedSocket.ts';

/** Production WebSocket URL. */
export const KALSHI_WS_URL = 'wss://external-api-ws.kalshi.com/trade-api/ws/v2';
/** Demo (fake-money) WebSocket URL — separate credentials from production. */
export const KALSHI_DEMO_WS_URL =
  'wss://external-api-ws.demo.kalshi.co/trade-api/ws/v2';

/**
 * Signs the handshake string with the account's key and returns the
 * standard-base64 signature — for keys held outside JavaScript (a native
 * signer, an HSM). RSA keys sign RSA-PSS-SHA256 with a 32-byte salt.
 */
export type KalshiSocketSigner = {
  sign(message: string): Promise<string>;
};

/**
 * Credentials: the same `auth` object the REST `Kalshi` client takes, or
 * an `accessKey` with an injected {@link KalshiSocketSigner} so the
 * private key never enters JavaScript.
 */
export type KalshiSocketAuth =
  | { type?: 'CUSTOM'; accessKey: string; privateKeyPem: string }
  | { type?: 'CUSTOM'; accessKey: string; signer: KalshiSocketSigner };

/** A Kalshi WebSocket channel. Unmodelled channels still work; their messages arrive as `unknown` events. */
export type KalshiChannel =
  | 'orderbook_delta'
  | 'ticker'
  | 'trade'
  | 'fill'
  | 'user_orders'
  | 'market_positions'
  | 'market_lifecycle_v2'
  | 'order_group_updates'
  | 'communications'
  // deno-lint-ignore ban-types -- keeps the literal suggestions while accepting any channel name
  | (string & {});

/** Options for {@link KalshiSocket}. */
export type KalshiSocketOptions = FeedSocketOptions & {
  auth: KalshiSocketAuth;
  /** Channels to subscribe to from the start, each to a ticker list or every market. */
  subscriptions?: { channel: KalshiChannel; marketTickers?: string[] }[];
};

/** Envelope fields every Kalshi data event carries. */
export type KalshiEnvelopeFields = {
  /** Subscription id (per connection). */
  sid: number;
  /** Per-`sid` sequence, when the channel has one. */
  seq?: number;
  /** When Kalshi queued the frame, Unix milliseconds. */
  sendingTsMs?: number;
};

/** Every event a {@link KalshiSocket} yields besides the lifecycle ones. */
export type KalshiSocketDataEvent =
  | (
    & FeedDataEvent<'orderbook_snapshot', KalshiOrderbookSnapshot>
    & KalshiEnvelopeFields
  )
  | (
    & FeedDataEvent<'orderbook_delta', KalshiOrderbookDelta>
    & KalshiEnvelopeFields
  )
  | (FeedDataEvent<'trade', KalshiFeedTrade> & KalshiEnvelopeFields)
  | (FeedDataEvent<'ticker', KalshiFeedTicker> & KalshiEnvelopeFields)
  | (FeedDataEvent<'fill', KalshiFeedFill> & KalshiEnvelopeFields)
  | (FeedDataEvent<'user_order', KalshiFeedUserOrder> & KalshiEnvelopeFields)
  | (
    & FeedDataEvent<'market_position', KalshiFeedMarketPosition>
    & KalshiEnvelopeFields
  );

/** Everything iterating a {@link KalshiSocket} can yield. */
export type KalshiSocketEvent =
  | KalshiSocketDataEvent
  | FeedLifecycleEvent<KalshiError>;

const SCHEMAS = {
  orderbook_snapshot: KalshiOrderbookSnapshotSchemaObject,
  orderbook_delta: KalshiOrderbookDeltaSchemaObject,
  trade: KalshiFeedTradeSchemaObject,
  ticker: KalshiFeedTickerSchemaObject,
  fill: KalshiFeedFillSchemaObject,
  user_order: KalshiFeedUserOrderSchemaObject,
  market_position: KalshiFeedMarketPositionSchemaObject,
} as const;

type DataType = keyof typeof SCHEMAS;

type ChannelState = {
  /** Wanted tickers; `null` = every market. */
  tickers: Set<string> | null;
  /** Tickers the venue has (or will have, once acked). */
  sent: Set<string> | null;
  sid?: number;
  pendingId?: number;
};

type Frame = {
  id?: number;
  type?: string;
  sid?: number;
  seq?: number;
  sending_ts_ms?: number;
  msg?: unknown;
};

/**
 * Kalshi's real-time feed.
 *
 * @example
 * ```ts
 * import { KalshiSocket } from '@tundraconnect/kalshi/sockets';
 *
 * const socket = new KalshiSocket({
 *   auth: { accessKey: '<key id>', privateKeyPem: '<PKCS#8 PEM>' },
 *   subscriptions: [
 *     { channel: 'orderbook_delta', marketTickers: ['KXBTCD-25DEC31-T100000'] },
 *     { channel: 'fill' },
 *   ],
 * });
 * for await (const event of socket) {
 *   if (event.type === 'orderbook_delta') console.log(event.seq, event.data.delta);
 *   if (event.type === 'gap') socket.requestSnapshot(['KXBTCD-25DEC31-T100000']);
 * }
 * ```
 */
export class KalshiSocket
  extends FeedSocket<KalshiSocketDataEvent, KalshiError> {
  public readonly feed = 'kalshi';
  readonly #accessKey: string;
  readonly #sign: (message: string) => Promise<string>;
  readonly #channels = new Map<string, ChannelState>();
  /** Command id → channel, for subscribe commands awaiting their ack. */
  readonly #pending = new Map<number, string>();
  #nextId = 1;

  /**
   * @throws {KalshiError} `SOCKET_MISSING_CREDENTIALS` when `auth` lacks
   * an access key or a key/signer; `CONFIG_INVALID_PRIVATE_KEY` when the
   * PEM is malformed.
   */
  constructor(options: KalshiSocketOptions) {
    super({
      heartbeatIntervalMs: 15_000,
      idleTimeoutMs: 45_000,
      ...options,
    });
    this._sendIntervalMs = 20;
    const auth = options.auth as Partial<
      { accessKey: string; privateKeyPem: string; signer: KalshiSocketSigner }
    >;
    if (!auth?.accessKey || (!auth.privateKeyPem && !auth.signer)) {
      throw new KalshiError('SOCKET_MISSING_CREDENTIALS', { feed: this.feed });
    }
    this.#accessKey = auth.accessKey;
    if (auth.signer) {
      const signer = auth.signer;
      this.#sign = (message) => signer.sign(message);
    } else {
      let pemSigner: KalshiSigner;
      try {
        pemSigner = new KalshiSigner(auth.privateKeyPem!);
      } catch (cause) {
        throw new KalshiError(
          'CONFIG_INVALID_PRIVATE_KEY',
          {},
          cause instanceof Error ? cause : undefined,
        );
      }
      this.#sign = (message) =>
        pemSigner.sign(new TextEncoder().encode(message));
    }
    for (const { channel, marketTickers } of options.subscriptions ?? []) {
      this.#channels.set(channel, {
        tickers: marketTickers ? new Set(marketTickers) : null,
        sent: null,
      });
    }
  }

  /** Channels currently wanted, with their ticker filter (`undefined` = every market). */
  public get subscriptions(): { channel: string; marketTickers?: string[] }[] {
    return [...this.#channels].map(([channel, s]) => ({
      channel,
      ...(s.tickers && { marketTickers: [...s.tickers] }),
    }));
  }

  /**
   * Subscribe to a channel — for `marketTickers`, or every market when
   * omitted. Calling again with more tickers adds them to the same
   * subscription.
   */
  public subscribe(channel: KalshiChannel, marketTickers?: string[]): void {
    const state = this.#channels.get(channel);
    if (!state) {
      this.#channels.set(channel, {
        tickers: marketTickers ? new Set(marketTickers) : null,
        sent: null,
      });
      this._touchData();
      if (this._isOpen) this.#sendSubscribe(channel);
      return;
    }
    if (state.tickers === null) return; // Already every market.
    if (!marketTickers) {
      // Widen to every market: replace the ticker-scoped subscription.
      state.tickers = null;
      if (state.sid !== undefined) {
        this.#command('unsubscribe', { sids: [state.sid] });
        this._forgetSequence(`sid:${state.sid}`);
        state.sid = undefined;
      }
      if (this._isOpen && state.pendingId === undefined) {
        this.#sendSubscribe(channel);
      }
      return;
    }
    for (const t of marketTickers) state.tickers.add(t);
    this.#reconcile(channel);
  }

  /** Unsubscribe `marketTickers`, or the whole channel when omitted (or none remain). */
  public unsubscribe(channel: KalshiChannel, marketTickers?: string[]): void {
    const state = this.#channels.get(channel);
    if (!state) return;
    if (marketTickers && state.tickers) {
      for (const t of marketTickers) state.tickers.delete(t);
      if (state.tickers.size > 0) {
        this.#reconcile(channel);
        return;
      }
    } else if (marketTickers && state.tickers === null) {
      return; // Every-market subscription: nothing to narrow.
    }
    this.#channels.delete(channel);
    if (state.sid !== undefined) {
      this.#command('unsubscribe', { sids: [state.sid] });
      this._forgetSequence(`sid:${state.sid}`);
    }
  }

  /**
   * Ask for fresh `orderbook_snapshot`s (after a `gap`, or a reconnect)
   * without changing the subscription. Returns `false` when there is no
   * live `orderbook_delta` subscription to ask on.
   */
  public requestSnapshot(marketTickers: string[]): boolean {
    const sid = this.#channels.get('orderbook_delta')?.sid;
    if (sid === undefined || !this._isOpen) return false;
    return this.#command('update_subscription', {
      sids: [sid],
      market_tickers: marketTickers,
      action: 'get_snapshot',
    }) !== undefined;
  }

  protected _error(
    code: FeedSocketErrorCode | KalshiErrorCode,
    meta?: Record<string, unknown>,
    cause?: Error,
  ): KalshiError {
    return new KalshiError(code, meta, cause);
  }

  protected _url(): string {
    return this._options.url ?? KALSHI_WS_URL;
  }

  protected override async _headers(): Promise<Record<string, string>> {
    const timestamp = Date.now();
    const path = new URL(this._url()).pathname;
    const signature = await this.#sign(signingString(timestamp, 'GET', path));
    return {
      'KALSHI-ACCESS-KEY': this.#accessKey,
      'KALSHI-ACCESS-SIGNATURE': signature,
      'KALSHI-ACCESS-TIMESTAMP': String(timestamp),
    };
  }

  protected _onOpen(): void {
    for (const channel of this.#channels.keys()) this.#sendSubscribe(channel);
  }

  protected override _onSessionEnd(): void {
    this.#pending.clear();
    for (const state of this.#channels.values()) {
      state.sid = undefined;
      state.pendingId = undefined;
      state.sent = null;
    }
    this._clearSequences();
  }

  protected override _heartbeat(): void {
    this.#command('list_subscriptions');
  }

  protected override _hasSubscriptions(): boolean {
    return this.#channels.size > 0;
  }

  protected _onText(text: string, receivedAt: number): boolean {
    const base = this._base(receivedAt, text);
    let frame: Frame;
    try {
      frame = JSON.parse(text) as Frame;
    } catch {
      this._emitError(
        this._error('SOCKET_VENUE_ERROR', { feed: this.feed, detail: text }),
        receivedAt,
      );
      return false;
    }
    const { type, sid, seq } = frame;
    if (typeof sid === 'number' && typeof seq === 'number') {
      this._sequence(`sid:${sid}`, seq, seq, base);
    }

    switch (type) {
      case 'subscribed':
        this.#onSubscribed(frame);
        return false;
      case 'ok':
      case 'unsubscribed':
        return false;
      case 'error': {
        const msg = (frame.msg ?? {}) as { code?: unknown; msg?: unknown };
        if (typeof frame.id === 'number') {
          const channel = this.#pending.get(frame.id);
          this.#pending.delete(frame.id);
          const state = channel ? this.#channels.get(channel) : undefined;
          if (state?.pendingId === frame.id) {
            state.pendingId = undefined;
            state.sent = null;
          }
        }
        this._emitError(
          this._error('SOCKET_VENUE_ERROR', {
            feed: this.feed,
            detail: `${msg.msg ?? 'error'} (code ${msg.code})`,
            venueCode: msg.code,
            commandId: frame.id,
          }),
          receivedAt,
        );
        return false;
      }
    }

    if (typeof type !== 'string' || !(type in SCHEMAS)) {
      this._emit({ ...base, type: 'unknown', data: frame });
      return true;
    }
    const dataType = type as DataType;
    const data = this._parse(
      SCHEMAS[dataType] as (typeof SCHEMAS)['trade'],
      frame.msg,
      dataType,
      base,
    );
    if (!data) return true;
    const venueTimestamp = (data as { tsMs?: number }).tsMs ??
      frame.sending_ts_ms;
    this._emit({
      ...base,
      type: dataType,
      sid: sid as number,
      ...(typeof seq === 'number' && { seq }),
      ...(typeof frame.sending_ts_ms === 'number' &&
        { sendingTsMs: frame.sending_ts_ms }),
      ...(venueTimestamp !== undefined && { venueTimestamp }),
      data,
    } as KalshiSocketDataEvent);
    return true;
  }

  #command(cmd: string, params?: Record<string, unknown>): number | undefined {
    const id = this.#nextId++;
    const sent = this._send(
      JSON.stringify(params ? { id, cmd, params } : { id, cmd }),
    );
    return sent ? id : undefined;
  }

  #sendSubscribe(channel: string): void {
    const state = this.#channels.get(channel);
    if (!state) return;
    const params: Record<string, unknown> = { channels: [channel] };
    if (state.tickers) params.market_tickers = [...state.tickers];
    const id = this.#command('subscribe', params);
    if (id === undefined) return;
    this.#pending.set(id, channel);
    state.pendingId = id;
    state.sent = state.tickers ? new Set(state.tickers) : null;
  }

  #onSubscribed(frame: Frame): void {
    const msg = (frame.msg ?? {}) as { channel?: unknown; sid?: unknown };
    const sid = typeof msg.sid === 'number' ? msg.sid : frame.sid;
    const channel =
      (typeof frame.id === 'number'
        ? this.#pending.get(frame.id)
        : undefined) ?? (typeof msg.channel === 'string' ? msg.channel : '');
    if (typeof frame.id === 'number') this.#pending.delete(frame.id);
    const state = this.#channels.get(channel);
    if (typeof sid !== 'number') return;
    if (!state) {
      // Unsubscribed while the subscribe was in flight.
      this.#command('unsubscribe', { sids: [sid] });
      return;
    }
    state.sid = sid;
    state.pendingId = undefined;
    this._forgetSequence(`sid:${sid}`);
    this.#reconcile(channel);
  }

  /** Bring the venue's ticker set for `channel` in line with what's wanted. */
  #reconcile(channel: string): void {
    const state = this.#channels.get(channel);
    if (!state || state.sid === undefined || !state.tickers || !state.sent) {
      return; // Not acked yet — #onSubscribed reconciles.
    }
    const add = [...state.tickers].filter((t) => !state.sent!.has(t));
    const remove = [...state.sent].filter((t) => !state.tickers!.has(t));
    if (add.length > 0) {
      this.#command('update_subscription', {
        sids: [state.sid],
        market_tickers: add,
        action: 'add_markets',
      });
      for (const t of add) state.sent.add(t);
    }
    if (remove.length > 0) {
      this.#command('update_subscription', {
        sids: [state.sid],
        market_tickers: remove,
        action: 'delete_markets',
      });
      for (const t of remove) state.sent.delete(t);
    }
  }
}
