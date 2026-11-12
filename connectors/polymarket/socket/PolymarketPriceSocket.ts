/**
 * @fileoverview PolyBolt (`wss://ws-live-v2.polymarket.com/ws`) —
 * Polymarket's reference-price socket: Chainlink/Pyth crypto, equities
 * (stocks, ETFs, forex, metals, commodities), Chainlink 60-second TWAPs and
 * Polymarket top-of-book. It replaced the legacy RTDS price topics.
 *
 * Wire protocol (PolyBolt AsyncAPI 2.0.0):
 *
 * - Reference-price channels are gated: send `{ op: 'auth', auth: {
 *   apiKey, secret, passphrase } }` (the CLOB L2 credentials) and wait for
 *   `{ op: 'authed' }` before subscribing. Refused credentials close 4001.
 * - `{ op: 'subscribe' | 'unsubscribe', subscriptions: [{ channel, filter
 *   }] }` — at most 64 subscriptions and 20 such frames per second per
 *   connection; a breach closes 4008, which this socket treats as fatal
 *   (the venue says not to reconnect blindly).
 * - Every payload arrives in `{ v, channel, seq, ts, snapshot?, dropped?,
 *   payload }`. `seq` is dense per connection and channel (reset on
 *   reconnect) — a jump is a `gap`. `dropped` counts frames the server
 *   shed for a slow consumer — reported as a `gap` with `missed`.
 * - Each new subscription is acknowledged (`subscribed`, naming the provider
 *   actually served — a pin the venue cannot serve falls back to the
 *   symbol's default) and then gets one snapshot
 *   frame (up to two minutes of history, as a batch), then live points.
 * - `source` on every point names the producing vendor; `price.crypto`
 *   defaults to Chainlink since 2026-10-02 and a symbol's vendor can
 *   change between connections. Equity payloads add `market_status`
 *   (2026-10-21); a status change re-sends the last price with
 *   `is_carried_forward: true` and the same `timestamp` — it is delivered
 *   like any other update, never de-duplicated.
 * - Crypto up/down markets settle on `price.crypto.twap` (Chainlink,
 *   `window_seconds: 60`); record `fullAccuracyValue` from it.
 * - The server pings at the WebSocket level (the runtime answers); the
 *   socket also sends `{ op: 'ping' }` as an application heartbeat so a
 *   dead connection is noticed.
 *
 * `subscribed` acks surface as `subscribed` events; `authed`, `unsubscribed`
 * and `pong` are consumed here; venue error acks surface as `error` events.
 *
 * @module
 */

import { PolymarketError } from '../errors/mod.ts';
import type { PolymarketErrorCode } from '../errors/mod.ts';
import {
  type ClobApiCredentials,
  type PolymarketPriceBestBidAsk,
  PolymarketPriceBestBidAskSchemaObject,
  PolymarketPriceEnvelopeSchemaObject,
  type PolymarketPriceSnapshot,
  PolymarketPriceSnapshotSchemaObject,
  type PolymarketPriceUpdate,
  PolymarketPriceUpdateSchemaObject,
} from '../schema/mod.ts';
import {
  type FeedDataEvent,
  type FeedEventBase,
  type FeedLifecycleEvent,
  FeedSocket,
  type FeedSocketErrorCode,
  type FeedSocketOptions,
} from './FeedSocket.ts';

/** PolyBolt URL. */
export const POLYMARKET_PRICE_WS_URL = 'wss://ws-live-v2.polymarket.com/ws';

/** A PolyBolt channel. */
export type PolymarketPriceChannel =
  | 'price.crypto'
  | 'price.crypto.twap'
  | 'price.equity'
  | 'price.equity.twap'
  | 'price.polymarket';

/** A provider a price subscription can be pinned to. */
export type PolymarketPriceProvider = 'chainlink' | 'pyth';

/**
 * The symbols PolyBolt documents per channel (as of 2026-10-21). The
 * venue adds symbols over time, so a filter takes any string; this is a
 * catalogue, not a whitelist.
 */
export const POLYMARKET_PRICE_SYMBOLS: {
  readonly crypto: readonly string[];
  readonly cryptoTwap: readonly string[];
  readonly cryptoPythPinnable: readonly string[];
  readonly equityTwap: readonly string[];
  readonly stocks: readonly string[];
  readonly etfs: readonly string[];
  readonly forex: readonly string[];
  readonly metals: readonly string[];
  readonly commodities: readonly string[];
} = {
  crypto: [
    'btcusd',
    'ethusd',
    'solusd',
    'xrpusd',
    'dogeusd',
    'hypeusd',
    'bnbusd',
    'zecusd',
  ],
  cryptoTwap: [
    'btcusd',
    'ethusd',
    'solusd',
    'xrpusd',
    'dogeusd',
    'hypeusd',
    'bnbusd',
    'zecusd',
  ],
  /** `price.crypto` symbols that also serve a `pyth` pin; the rest are Chainlink only. */
  cryptoPythPinnable: [
    'btcusd',
    'ethusd',
    'solusd',
    'xrpusd',
    'dogeusd',
    'bnbusd',
  ],
  equityTwap: ['eurusd', 'usdjpy'],
  stocks: [
    'aapl',
    'tsla',
    'msft',
    'googl',
    'amzn',
    'meta',
    'nvda',
    'nflx',
    'pltr',
    'open',
    'rklb',
    'abnb',
    'coin',
    'hood',
    'spcx',
    'intc',
    'mstr',
    'crcl',
    'mu',
  ],
  etfs: ['qqq', 'spy', 'ewy', 'vxx'],
  /** `usdbrl` trades weekdays only — outside those hours its `marketStatus` is `closed`. */
  forex: [
    'eurusd',
    'gbpusd',
    'usdcad',
    'usdjpy',
    'usdkrw',
    'usdchf',
    'usdmxn',
    'usdzar',
    'usdbrl',
    'usdnok',
    'usdsek',
    'usdtry',
  ],
  metals: ['xauusd', 'xagusd'],
  /** `cll` WTI crude and `hn` Henry Hub (front month, rolling); `cc3m` copper 3-month. */
  commodities: ['cll', 'hn', 'cc3m'],
};

/**
 * A subscription filter. Price channels take a lower-case `symbol`
 * (`btcusd`, `aapl`, see {@link POLYMARKET_PRICE_SYMBOLS});
 * `price.polymarket` takes an outcome-token `assetId`.
 */
export type PolymarketPriceFilter = {
  symbol?: string;
  /** TWAP channels: the averaging window. Only `60` carries data, and it is the default there. */
  windowSeconds?: number;
  /**
   * Pin a vendor on `price.crypto`, `price.equity` or `price.equity.twap`.
   * Omitted, the symbol's default (Chainlink wherever it serves the
   * symbol). A pin the venue cannot serve falls back to that default — the
   * `subscribed` event's `provider` names what was actually served.
   */
  provider?: PolymarketPriceProvider;
  assetId?: string;
};

/** Options for {@link PolymarketPriceSocket}. */
export type PolymarketPriceSocketOptions = FeedSocketOptions & {
  /**
   * CLOB API credentials — required for the reference-price channels.
   * Pass the same `auth` object as the REST `Polymarket` client.
   */
  auth?: { apiCredentials?: ClobApiCredentials };
  /** Subscriptions to open from the start. */
  subscriptions?: {
    channel: PolymarketPriceChannel;
    filter: PolymarketPriceFilter;
  }[];
};

/** Envelope fields every PolyBolt data event carries. */
export type PolymarketPriceEnvelopeFields = {
  channel: PolymarketPriceChannel | string;
  /** Per connection and channel; resets on reconnect. */
  seq: number;
  /** Producer event time, Unix milliseconds. */
  ts: number;
  /** True on the one snapshot frame after each new subscription. */
  snapshot: boolean;
};

/** A `subscribed` acknowledgement — one per accepted subscription. */
export type PolymarketPriceSubscribed = {
  channel: PolymarketPriceChannel | string;
  /**
   * The vendor actually served — the pin when it held, else the symbol's
   * default it fell back to. Absent when the venue does not say (e.g.
   * `price.polymarket`).
   */
  provider?: string;
  /** The request id this socket sent the subscription under. */
  rid?: string;
  /**
   * The subscription acknowledged, in wire form (`symbol`, `window_seconds`,
   * `provider`, `asset_id`). This socket never puts two subscriptions on
   * one channel in the same request, so this is exactly one filter — empty
   * only for an ack this socket did not ask for.
   */
  filters: Record<string, string | number>[];
};

/** Every event a {@link PolymarketPriceSocket} yields besides the lifecycle ones. */
export type PolymarketPriceEvent =
  | FeedDataEvent<'subscribed', PolymarketPriceSubscribed>
  | (
    & FeedDataEvent<'price', PolymarketPriceUpdate>
    & PolymarketPriceEnvelopeFields
  )
  | (
    & FeedDataEvent<'price_snapshot', PolymarketPriceSnapshot>
    & PolymarketPriceEnvelopeFields
  )
  | (
    & FeedDataEvent<'best_bid_ask', PolymarketPriceBestBidAsk>
    & PolymarketPriceEnvelopeFields
  );

/** Everything iterating a {@link PolymarketPriceSocket} can yield. */
export type PolymarketPriceSocketEvent =
  | PolymarketPriceEvent
  | FeedLifecycleEvent<PolymarketError>;

type WireFilter = Record<string, string | number>;
type WireSubscription = { channel: string; filter: WireFilter };

/** The averaging window every TWAP subscription defaults to — the only one carrying data. */
const TWAP_WINDOW_SECONDS = 60;

function toWire(channel: string, filter: PolymarketPriceFilter): WireFilter {
  const wire: WireFilter = {};
  if (filter.symbol !== undefined) wire.symbol = filter.symbol.toLowerCase();
  const window = filter.windowSeconds ??
    (channel.endsWith('.twap') ? TWAP_WINDOW_SECONDS : undefined);
  if (window !== undefined) wire.window_seconds = window;
  if (filter.provider !== undefined) wire.provider = filter.provider;
  if (filter.assetId !== undefined) wire.asset_id = filter.assetId;
  return wire;
}

const keyOf = (channel: string, filter: WireFilter): string =>
  `${channel} ${
    JSON.stringify(Object.fromEntries(Object.entries(filter).sort()))
  }`;

/**
 * Polymarket's PolyBolt reference-price feed.
 *
 * @example
 * ```ts
 * import { PolymarketPriceSocket } from '@tundraconnect/polymarket/sockets';
 *
 * const socket = new PolymarketPriceSocket({
 *   auth: {
 *     apiCredentials: { apiKey: '<key>', secret: '<secret>', passphrase: '<passphrase>' },
 *   },
 *   subscriptions: [
 *     // The stream BTC up/down markets settle on — record it at full precision.
 *     { channel: 'price.crypto.twap', filter: { symbol: 'btcusd' } },
 *     { channel: 'price.crypto', filter: { symbol: 'btcusd', provider: 'pyth' } },
 *   ],
 *   includeRaw: true,
 * });
 * for await (const event of socket) {
 *   if (event.type === 'subscribed') console.log('served by', event.data.provider);
 *   if (event.type === 'price') {
 *     console.log(event.channel, event.data.fullAccuracyValue, event.data.source, event.receivedAt);
 *   }
 *   if (event.type === 'gap') console.warn('missed frames on', event.stream);
 * }
 * ```
 */
export class PolymarketPriceSocket
  extends FeedSocket<PolymarketPriceEvent, PolymarketError> {
  public readonly feed = 'polymarket-price';
  readonly #credentials?: ClobApiCredentials;
  readonly #subs = new Map<string, WireSubscription>();
  /** Subscribe requests awaiting acks this session: rid → its subscriptions. */
  readonly #pending = new Map<string, WireSubscription[]>();
  #rid = 0;
  #authed = false;

  constructor(options: PolymarketPriceSocketOptions = {}) {
    super({
      heartbeatIntervalMs: 15_000,
      idleTimeoutMs: 45_000,
      ...options,
    });
    this._sendIntervalMs = 60;
    const creds = options.auth?.apiCredentials;
    if (creds) this.#credentials = { ...creds };
    for (const { channel, filter } of options.subscriptions ?? []) {
      const wire = toWire(channel, filter);
      this.#subs.set(keyOf(channel, wire), { channel, filter: wire });
    }
  }

  /** Current subscriptions, in wire form. */
  public get subscriptions(): WireSubscription[] {
    return [...this.#subs.values()].map((s) => ({ ...s }));
  }

  /** Subscribe to one channel + filter. Duplicates are ignored. */
  public subscribe(
    channel: PolymarketPriceChannel,
    filter: PolymarketPriceFilter,
  ): void {
    const wire = toWire(channel, filter);
    const key = keyOf(channel, wire);
    if (this.#subs.has(key)) return;
    this.#subs.set(key, { channel, filter: wire });
    this._touchData();
    if (this.#ready()) this.#sendSubscribe([{ channel, filter: wire }]);
  }

  /** Unsubscribe one channel + filter. */
  public unsubscribe(
    channel: PolymarketPriceChannel,
    filter: PolymarketPriceFilter,
  ): void {
    const wire = toWire(channel, filter);
    if (!this.#subs.delete(keyOf(channel, wire))) return;
    if (this.#ready()) {
      this._send(JSON.stringify({
        op: 'unsubscribe',
        subscriptions: [{ channel, filter: wire }],
      }));
    }
  }

  protected _error(
    code: FeedSocketErrorCode | PolymarketErrorCode,
    meta?: Record<string, unknown>,
    cause?: Error,
  ): PolymarketError {
    return new PolymarketError(code, meta, cause);
  }

  protected _url(): string {
    return this._options.url ?? POLYMARKET_PRICE_WS_URL;
  }

  protected _onOpen(): void {
    if (this.#credentials) {
      const { apiKey, secret, passphrase } = this.#credentials;
      this._send(JSON.stringify({
        op: 'auth',
        rid: 'auth',
        auth: { apiKey, secret, passphrase },
      }));
      return;
    }
    this.#resubscribe();
  }

  protected override _onSessionEnd(): void {
    this.#authed = false;
    this.#pending.clear();
    this._clearSequences();
  }

  protected override _heartbeat(): void {
    this._send(JSON.stringify({ op: 'ping' }));
  }

  protected override _hasSubscriptions(): boolean {
    return this.#subs.size > 0;
  }

  protected override _fatalClose(
    code: number | undefined,
    reason: string,
  ): PolymarketError | undefined {
    if (code === 4001) {
      return this._error('SOCKET_AUTH_FAILED', {
        feed: this.feed,
        detail: reason || 'close 4001',
      });
    }
    if (code === 4008) {
      return this._error('SOCKET_VENUE_ERROR', {
        feed: this.feed,
        detail: `policy violation (close 4008): ${reason}`,
      });
    }
    return undefined;
  }

  protected _onText(text: string, receivedAt: number): boolean {
    const base = this._base(receivedAt, text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this._emitError(
        this._error('SOCKET_VENUE_ERROR', { feed: this.feed, detail: text }),
        receivedAt,
      );
      return false;
    }
    const obj = (parsed ?? {}) as Record<string, unknown>;
    if (typeof obj.op === 'string') return this.#onAck(obj, base);
    if (obj.channel === undefined || obj.payload === undefined) {
      this._emit({ ...base, type: 'unknown', data: parsed });
      return true;
    }

    const envelope = this._parse(
      PolymarketPriceEnvelopeSchemaObject,
      parsed,
      'envelope',
      base,
    );
    if (!envelope) return true;
    const channel = envelope.channel;
    this._sequence(channel, envelope.seq, envelope.seq, base);
    if (envelope.dropped) {
      this._emit({
        ...base,
        type: 'gap',
        stream: channel,
        expected: envelope.seq,
        received: envelope.seq,
        missed: envelope.dropped,
      });
    }
    const fields: PolymarketPriceEnvelopeFields = {
      channel,
      seq: envelope.seq,
      ts: envelope.ts,
      snapshot: envelope.snapshot === true,
    };

    if (channel === 'price.polymarket') {
      if (Array.isArray(envelope.payload)) {
        // A cold token's snapshot: an empty array, nothing to type.
        this._emit({ ...base, type: 'unknown', data: parsed });
        return true;
      }
      const data = this._parse(
        PolymarketPriceBestBidAskSchemaObject,
        envelope.payload,
        channel,
        base,
      );
      if (data) {
        this._emit({
          ...base,
          ...fields,
          type: 'best_bid_ask',
          venueTimestamp: data.timestamp,
          data,
        });
      }
      return true;
    }

    const batch = (envelope.payload as { data?: unknown }).data;
    if (Array.isArray(batch)) {
      const data = this._parse(
        PolymarketPriceSnapshotSchemaObject,
        envelope.payload,
        channel,
        base,
      );
      if (data) {
        this._emit({
          ...base,
          ...fields,
          type: 'price_snapshot',
          venueTimestamp: envelope.ts,
          data,
        });
      }
      return true;
    }
    const data = this._parse(
      PolymarketPriceUpdateSchemaObject,
      envelope.payload,
      channel,
      base,
    );
    if (data) {
      this._emit({
        ...base,
        ...fields,
        type: 'price',
        venueTimestamp: data.timestamp,
        data,
      });
    }
    return true;
  }

  #ready(): boolean {
    return this._isOpen && (!this.#credentials || this.#authed);
  }

  #resubscribe(): void {
    // An ack names its channel and rid but not its filter, so each request
    // carries at most one subscription per channel: every ack — and the
    // provider it reports — then maps to exactly one subscription. (At most
    // five channels per frame keeps each one far below 64 KB.)
    const byChannel = new Map<string, WireSubscription[]>();
    for (const sub of this.#subs.values()) {
      const list = byChannel.get(sub.channel) ?? [];
      list.push(sub);
      byChannel.set(sub.channel, list);
    }
    const depth = Math.max(0, ...[...byChannel.values()].map((l) => l.length));
    for (let i = 0; i < depth; i++) {
      this.#sendSubscribe(
        [...byChannel.values()].flatMap((list) => list[i] ? [list[i]!] : []),
      );
    }
  }

  #sendSubscribe(subscriptions: WireSubscription[]): void {
    const rid = `s${++this.#rid}`;
    this.#pending.set(rid, subscriptions);
    this._send(JSON.stringify({ op: 'subscribe', rid, subscriptions }));
  }

  #onAck(ack: Record<string, unknown>, base: FeedEventBase): boolean {
    const receivedAt = base.receivedAt;
    if (ack.op === 'authed') {
      this.#authed = true;
      this.#resubscribe();
      return false;
    }
    if (ack.op === 'subscribed') {
      const channel = String(ack.channel ?? '');
      const rid = typeof ack.rid === 'string' ? ack.rid : undefined;
      const filters = (rid ? this.#pending.get(rid) ?? [] : [])
        .filter((s) => s.channel === channel)
        .map((s) => ({ ...s.filter }));
      this._emit({
        ...base,
        type: 'subscribed',
        data: {
          channel,
          ...(typeof ack.provider === 'string'
            ? { provider: ack.provider }
            : {}),
          ...(rid ? { rid } : {}),
          filters,
        },
      });
      return false; // an ack, not data — leaves the data watchdog alone
    }
    if (ack.op !== 'error') return false; // unsubscribed, pong, challenge
    const code = String(ack.code);
    const detail = `${code}${ack.channel ? ` on ${ack.channel}` : ''}`;
    if (code === 'auth_invalid' || code === 'auth_attempts') {
      this._fail(
        this._error('SOCKET_AUTH_FAILED', { feed: this.feed, detail }),
      );
      return false;
    }
    this._emitError(
      this._error('SOCKET_VENUE_ERROR', {
        feed: this.feed,
        detail,
        venueCode: code,
      }),
      receivedAt,
    );
    if (code === 'auth_unavailable') this._reconnect('auth_unavailable');
    return false;
  }
}
