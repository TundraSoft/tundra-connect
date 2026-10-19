/**
 * @fileoverview Binance.com spot market-data streams — raw trades, best
 * bid/ask and the 100ms diff-depth stream. Public, no credentials.
 *
 * Wire protocol (developers.binance.com → WebSocket Streams):
 *
 * - Connects to the combined-stream endpoint (`/stream`), so every payload
 *   arrives as `{ stream, data }`, and adds/removes streams on the open
 *   connection with `{ method: 'SUBSCRIBE' | 'UNSUBSCRIBE', params, id }`.
 * - Binance allows 5 incoming messages per second per connection; this
 *   socket paces its frames 250ms apart and packs up to 100 streams per
 *   SUBSCRIBE. At most 1024 streams per connection.
 * - The server pings at the WebSocket level every 20s (the runtime
 *   answers) and drops every connection after 24 hours — that reconnect is
 *   reported like any other. Since the runtime can't surface those pings,
 *   this socket sends `LIST_SUBSCRIPTIONS` as its heartbeat.
 * - Trade ids are consecutive per symbol and each diff-depth event's `U`
 *   must be the previous event's `u` + 1; a jump in either is a `gap`, also
 *   across a reconnect. After a depth gap, rebuild the book from a REST
 *   snapshot.
 * - A geo-blocked region refuses the handshake with HTTP 451 (or 403).
 *   The WebSocket API can't see HTTP statuses, so after a failed handshake
 *   the socket asks the same host over `fetch`; a 451/403 is a fatal
 *   `SOCKET_GEO_BLOCKED` instead of an endless reconnect loop.
 *
 * Every message is delivered: each individual trade (raw `@trade`, never
 * `@aggTrade`), each book-ticker change, each depth diff at full depth.
 *
 * @module
 */

import { BinanceError } from '../errors/mod.ts';
import type { BinanceErrorCode } from '../errors/mod.ts';
import {
  type BinanceBookTicker,
  BinanceBookTickerSchemaObject,
  type BinanceDepthUpdate,
  BinanceDepthUpdateSchemaObject,
  type BinanceTrade,
  BinanceTradeSchemaObject,
} from '../schema/mod.ts';
import {
  type FeedDataEvent,
  type FeedLifecycleEvent,
  FeedSocket,
  type FeedSocketErrorCode,
  type FeedSocketOptions,
} from './FeedSocket.ts';

/** Market-data-only host (no account/trading streams). The default. */
export const BINANCE_DATA_STREAM_URL =
  'wss://data-stream.binance.vision/stream';
/** Main spot stream host. */
export const BINANCE_STREAM_URL = 'wss://stream.binance.com:9443/stream';

/** A stream kind this socket models. */
export type BinanceStreamKind = 'trade' | 'bookTicker' | 'depth';

const SUFFIX: Record<BinanceStreamKind, string> = {
  trade: '@trade',
  bookTicker: '@bookTicker',
  depth: '@depth@100ms',
};

const BATCH_SIZE = 100;

/** Options for {@link BinanceMarketSocket}. */
export type BinanceMarketSocketOptions = FeedSocketOptions & {
  /**
   * `'data-stream'` (`data-stream.binance.vision`, market data only) or
   * `'stream'` (`stream.binance.com:9443`). Ignored when `url` is set.
   * @default 'data-stream'
   */
  host?: 'data-stream' | 'stream';
  /** Timestamp unit for `E`/`T` fields. @default 'MILLISECOND' */
  timeUnit?: 'MILLISECOND' | 'MICROSECOND';
  /** Streams to open from the start, by kind, as symbols (`BTCUSDT`, `btc-usdt`, ...). */
  streams?: Partial<Record<BinanceStreamKind, string[]>>;
};

/** The combined-stream name an event came from, e.g. `btcusdt@trade`. */
export type BinanceStreamField = { stream: string };

/** Every event a {@link BinanceMarketSocket} yields besides the lifecycle ones. */
export type BinanceMarketEvent =
  | (FeedDataEvent<'trade', BinanceTrade> & BinanceStreamField)
  | (FeedDataEvent<'bookTicker', BinanceBookTicker> & BinanceStreamField)
  | (FeedDataEvent<'depthUpdate', BinanceDepthUpdate> & BinanceStreamField);

/** Everything iterating a {@link BinanceMarketSocket} can yield. */
export type BinanceMarketSocketEvent =
  | BinanceMarketEvent
  | FeedLifecycleEvent<BinanceError>;

/** `BTC-USDT` / `btc_usdt` / `BTCUSDT` → `btcusdt`. */
const toStreamSymbol = (symbol: string): string =>
  symbol.replace(/[-_/]/g, '').toLowerCase();

/**
 * Binance.com spot market-data feed.
 *
 * @example
 * ```ts
 * import { BinanceMarketSocket } from '@tundraconnect/binance/sockets';
 *
 * const socket = new BinanceMarketSocket({
 *   streams: { trade: ['BTCUSDT', 'ETHUSDT'], bookTicker: ['BTCUSDT'] },
 * });
 * for await (const event of socket) {
 *   if (event.type === 'trade') {
 *     console.log(event.data.symbol, event.data.price, event.data.tradeTime, event.receivedAt);
 *   }
 *   if (event.type === 'gap') console.warn('missed', event.stream);
 * }
 * ```
 */
export class BinanceMarketSocket
  extends FeedSocket<BinanceMarketEvent, BinanceError> {
  public readonly feed = 'binance-market';
  /** Stream names (`btcusdt@trade`) currently wanted. */
  readonly #streams = new Set<string>();
  readonly #host: 'data-stream' | 'stream';
  readonly #timeUnit: 'MILLISECOND' | 'MICROSECOND';
  #nextId = 1;

  constructor(options: BinanceMarketSocketOptions = {}) {
    super({
      heartbeatIntervalMs: 20_000,
      idleTimeoutMs: 60_000,
      ...options,
    });
    this._sendIntervalMs = 250;
    this.#host = options.host ?? 'data-stream';
    this.#timeUnit = options.timeUnit ?? 'MILLISECOND';
    for (const [kind, symbols] of Object.entries(options.streams ?? {})) {
      for (const s of symbols ?? []) {
        this.#streams.add(
          toStreamSymbol(s) + SUFFIX[kind as BinanceStreamKind],
        );
      }
    }
  }

  /** Stream names currently subscribed, e.g. `btcusdt@depth@100ms`. */
  public get streams(): string[] {
    return [...this.#streams];
  }

  /** Subscribe `symbols` to one stream kind. Already-open streams are ignored. */
  public subscribe(kind: BinanceStreamKind, symbols: string[]): void {
    const added = symbols
      .map((s) => toStreamSymbol(s) + SUFFIX[kind])
      .filter((name) => {
        if (this.#streams.has(name)) return false;
        this.#streams.add(name);
        return true;
      });
    if (added.length === 0) return;
    this._touchData();
    this.#batched('SUBSCRIBE', added);
  }

  /** Unsubscribe `symbols` from one stream kind. */
  public unsubscribe(kind: BinanceStreamKind, symbols: string[]): void {
    const removed = symbols
      .map((s) => toStreamSymbol(s) + SUFFIX[kind])
      .filter((name) => this.#streams.delete(name));
    if (removed.length === 0) return;
    for (const name of removed) this._forgetSequence(name);
    this.#batched('UNSUBSCRIBE', removed);
  }

  protected _error(
    code: FeedSocketErrorCode | BinanceErrorCode,
    meta?: Record<string, unknown>,
    cause?: Error,
  ): BinanceError {
    return new BinanceError(code, meta, cause);
  }

  protected _url(): string {
    if (this._options.url) return this._options.url;
    const base = this.#host === 'stream'
      ? BINANCE_STREAM_URL
      : BINANCE_DATA_STREAM_URL;
    return this.#timeUnit === 'MICROSECOND'
      ? `${base}?timeUnit=MICROSECOND`
      : base;
  }

  protected _onOpen(): void {
    this.#batched('SUBSCRIBE', [...this.#streams]);
  }

  protected override _heartbeat(): void {
    this._send(
      JSON.stringify({ method: 'LIST_SUBSCRIPTIONS', id: this.#nextId++ }),
    );
  }

  protected override _hasSubscriptions(): boolean {
    return this.#streams.size > 0;
  }

  protected override async _diagnoseConnectFailure(
    url: string,
  ): Promise<BinanceError | undefined> {
    const probe = url.replace(/^ws(s?):/, 'http$1:');
    try {
      const response = await fetch(probe, {
        signal: AbortSignal.timeout(5_000),
      });
      await response.body?.cancel();
      if (response.status === 451 || response.status === 403) {
        return this._error('SOCKET_GEO_BLOCKED', {
          feed: this.feed,
          status: response.status,
          url,
        });
      }
    } catch {
      // Unreachable too: a network failure, retried with backoff.
    }
    return undefined;
  }

  protected _onText(text: string, receivedAt: number): boolean {
    const base = this._base(receivedAt, text);
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(text) as Record<string, unknown>;
    } catch {
      this._emitError(
        this._error('SOCKET_VENUE_ERROR', { feed: this.feed, detail: text }),
        receivedAt,
      );
      return false;
    }
    if ('id' in frame && ('result' in frame || 'error' in frame)) {
      const error = frame.error as
        | { code?: unknown; msg?: unknown }
        | undefined;
      if (error) {
        this._emitError(
          this._error('SOCKET_VENUE_ERROR', {
            feed: this.feed,
            detail: `${error.msg ?? 'error'} (code ${error.code})`,
            venueCode: error.code,
            requestId: frame.id,
          }),
          receivedAt,
        );
      }
      return false;
    }

    // Combined streams wrap the payload; a raw `/ws` URL doesn't.
    const stream = typeof frame.stream === 'string' ? frame.stream : undefined;
    const data = (stream ? frame.data : frame) as
      | Record<string, unknown>
      | undefined;
    const eventType = data?.e;
    const symbol = typeof data?.s === 'string' ? data.s.toLowerCase() : '';

    if (eventType === 'trade') {
      const name = stream ?? `${symbol}@trade`;
      const trade = this._parse(BinanceTradeSchemaObject, data, 'trade', base);
      if (!trade) return true;
      this._sequence(name, trade.tradeId, trade.tradeId, base);
      this._emit({
        ...base,
        type: 'trade',
        stream: name,
        venueTimestamp: trade.tradeTime,
        data: trade,
      });
      return true;
    }
    if (eventType === 'depthUpdate') {
      const name = stream ?? `${symbol}@depth@100ms`;
      const depth = this._parse(
        BinanceDepthUpdateSchemaObject,
        data,
        'depthUpdate',
        base,
      );
      if (!depth) return true;
      this._sequence(name, depth.firstUpdateId, depth.finalUpdateId, base);
      this._emit({
        ...base,
        type: 'depthUpdate',
        stream: name,
        venueTimestamp: depth.eventTime,
        data: depth,
      });
      return true;
    }
    if (
      stream?.endsWith('@bookTicker') ||
      (eventType === undefined && data && 'b' in data && 'a' in data)
    ) {
      const top = this._parse(
        BinanceBookTickerSchemaObject,
        data,
        'bookTicker',
        base,
      );
      if (!top) return true;
      this._emit({
        ...base,
        type: 'bookTicker',
        stream: stream ?? `${symbol}@bookTicker`,
        data: top,
      });
      return true;
    }
    this._emit({ ...base, type: 'unknown', data: frame });
    return true;
  }

  #batched(method: 'SUBSCRIBE' | 'UNSUBSCRIBE', names: string[]): void {
    for (let i = 0; i < names.length; i += BATCH_SIZE) {
      this._send(JSON.stringify({
        method,
        params: names.slice(i, i + BATCH_SIZE),
        id: this.#nextId++,
      }));
    }
  }
}
