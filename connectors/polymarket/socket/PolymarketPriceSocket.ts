/**
 * @fileoverview PolyBolt (`wss://ws-live-v2.polymarket.com/ws`) —
 * Polymarket's reference-price socket: Chainlink/Pyth crypto, equities,
 * 60-second TWAPs and Polymarket top-of-book.
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
 * - Each new subscription first gets one snapshot frame (up to two minutes
 *   of history, as a batch), then live points.
 * - The server pings at the WebSocket level (the runtime answers); the
 *   socket also sends `{ op: 'ping' }` as an application heartbeat so a
 *   dead connection is noticed.
 *
 * Acks (`authed`, `subscribed`, `pong`) are consumed here; venue error
 * acks surface as `error` events.
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

/**
 * A subscription filter. Price channels take a lower-case `symbol`
 * (`btcusd`, `aapl`); TWAP channels add `windowSeconds` (only 60 carries
 * data); `price.polymarket` takes an outcome-token `assetId`.
 */
export type PolymarketPriceFilter = {
  symbol?: string;
  windowSeconds?: number;
  /** Pin a provider. Ignored while the venue's provider selector is off. */
  provider?: 'chainlink' | 'pyth';
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

/** Every event a {@link PolymarketPriceSocket} yields besides the lifecycle ones. */
export type PolymarketPriceEvent =
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

function toWire(filter: PolymarketPriceFilter): WireFilter {
  const wire: WireFilter = {};
  if (filter.symbol !== undefined) wire.symbol = filter.symbol.toLowerCase();
  if (filter.windowSeconds !== undefined) {
    wire.window_seconds = filter.windowSeconds;
  }
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
 *   subscriptions: [{ channel: 'price.crypto', filter: { symbol: 'btcusd' } }],
 * });
 * for await (const event of socket) {
 *   if (event.type === 'price') {
 *     console.log(event.data.symbol, event.data.fullAccuracyValue, event.data.source);
 *   }
 * }
 * ```
 */
export class PolymarketPriceSocket
  extends FeedSocket<PolymarketPriceEvent, PolymarketError> {
  public readonly feed = 'polymarket-price';
  readonly #credentials?: ClobApiCredentials;
  readonly #subs = new Map<string, { channel: string; filter: WireFilter }>();
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
      const wire = toWire(filter);
      this.#subs.set(keyOf(channel, wire), { channel, filter: wire });
    }
  }

  /** Current subscriptions, in wire form. */
  public get subscriptions(): { channel: string; filter: WireFilter }[] {
    return [...this.#subs.values()].map((s) => ({ ...s }));
  }

  /** Subscribe to one channel + filter. Duplicates are ignored. */
  public subscribe(
    channel: PolymarketPriceChannel,
    filter: PolymarketPriceFilter,
  ): void {
    const wire = toWire(filter);
    const key = keyOf(channel, wire);
    if (this.#subs.has(key)) return;
    this.#subs.set(key, { channel, filter: wire });
    this._touchData();
    if (this.#ready()) {
      this._send(JSON.stringify({
        op: 'subscribe',
        subscriptions: [{ channel, filter: wire }],
      }));
    }
  }

  /** Unsubscribe one channel + filter. */
  public unsubscribe(
    channel: PolymarketPriceChannel,
    filter: PolymarketPriceFilter,
  ): void {
    const wire = toWire(filter);
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
    if (typeof obj.op === 'string') return this.#onAck(obj, receivedAt);
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
    const subs = [...this.#subs.values()];
    // One frame per 32 subscriptions keeps each frame far below 64 KB.
    for (let i = 0; i < subs.length; i += 32) {
      this._send(JSON.stringify({
        op: 'subscribe',
        subscriptions: subs.slice(i, i + 32),
      }));
    }
  }

  #onAck(ack: Record<string, unknown>, receivedAt: number): boolean {
    if (ack.op === 'authed') {
      this.#authed = true;
      this.#resubscribe();
      return false;
    }
    if (ack.op !== 'error') return false; // subscribed, unsubscribed, pong, challenge
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
