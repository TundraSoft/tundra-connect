/**
 * @fileoverview Deribit JSON-RPC WebSocket feed (`/ws/api/v2`): order
 * books, trades, tickers (mark IV, greeks), DVOL, price indices and option
 * mark prices.
 *
 * Wire protocol (docs.deribit.com → Subscriptions):
 *
 * - Every request is `{ jsonrpc: '2.0', id, method, params }`; answers
 *   echo the `id` with `result` or `error`. Data arrives as
 *   `{ method: 'subscription', params: { channel, data } }`.
 * - Intervals: `raw` (every event), `100ms` (batched, but no event is
 *   dropped from books or trades) and `agg2`. **`raw` needs an
 *   authenticated connection** — without one Deribit refuses it with error
 *   13778 `raw_subscriptions_not_available_for_unauthorized` (verified
 *   2026-11-06). With `interval: 'finest'` (the default) this socket uses
 *   `raw` when `auth` is configured and `100ms` otherwise.
 * - Auth is `public/auth` with `client_credentials`; a read-only key is
 *   enough. The token is refreshed before it expires (`refresh_token`);
 *   every reconnect authenticates again before resubscribing.
 * - Liveness: `public/set_heartbeat` makes Deribit send a `heartbeat`
 *   every interval and a `test_request` that must be answered with
 *   `public/test`, or it closes the connection. Silence beyond the idle
 *   timeout reconnects.
 * - Books chain by id: each `change`'s `prev_change_id` is the previous
 *   notification's `change_id`. A mismatch is a `gap` event — rebuild from
 *   `Deribit.getOrderBook` or resubscribe. Trades carry a consecutive
 *   `trade_seq` per instrument; a jump is a `gap`, also across a reconnect.
 *
 * Every notification is delivered: each trade of a batch, each book
 * change at full depth, each option mark. Integers wider than 2^53
 * (`starbase_match_id`, nanosecond `starbase_timestamp`) keep their exact
 * digits as strings.
 *
 * @module
 */

import { DeribitError } from '../errors/mod.ts';
import type { DeribitErrorCode } from '../errors/mod.ts';
import {
  type DeribitAuthResultSchema,
  DeribitAuthResultSchemaObject,
  type DeribitBookUpdateSchema,
  DeribitBookUpdateSchemaObject,
  type DeribitMarkPriceSchema,
  DeribitMarkPriceSchemaObject,
  type DeribitPriceIndexSchema,
  DeribitPriceIndexSchemaObject,
  type DeribitTickerSchema,
  DeribitTickerSchemaObject,
  type DeribitTradeSchema,
  DeribitTradeSchemaObject,
  type DeribitVolatilityIndexSchema,
  DeribitVolatilityIndexSchemaObject,
} from '../schema/mod.ts';
import { parseJsonLossless } from '../json.ts';
import {
  type FeedDataEvent,
  type FeedEventBase,
  type FeedLifecycleEvent,
  FeedSocket,
  type FeedSocketErrorCode,
  type FeedSocketOptions,
} from './FeedSocket.ts';

/** Socket URLs by environment. */
export const DERIBIT_WS_URLS: Readonly<
  Record<'production' | 'testnet', string>
> = {
  production: 'wss://www.deribit.com/ws/api/v2',
  testnet: 'wss://test.deribit.com/ws/api/v2',
};

/**
 * Deribit API credentials (`client_credentials`). A key with read-only
 * scope is enough for market data. Same shape the REST client would take.
 */
export type DeribitAuth = {
  type: 'CUSTOM';
  /** Client ID from Account → API. */
  clientId: string;
  /** Client Secret (shown once when the key is created). */
  clientSecret: string;
};

/** Notification interval of book, trades and ticker channels. */
export type DeribitInterval = 'raw' | '100ms' | 'agg2';

/** Instrument kinds a currency-wide trades channel can cover. */
export type DeribitTradesKind =
  | 'future'
  | 'option'
  | 'spot'
  | 'future_combo'
  | 'option_combo'
  | 'any';

/** One subscription. Each maps to exactly one Deribit channel. */
export type DeribitSubscription =
  /** `book.<instrument>.<interval>`: snapshot, then every change at full depth. */
  | { kind: 'book'; instrument: string }
  /** `trades.<instrument>.<interval>`. */
  | { kind: 'trades'; instrument: string }
  /** `trades.<kind>.<currency>.<interval>`: every trade of a currency, e.g. all BTC options. */
  | { kind: 'trades'; instrumentKind: DeribitTradesKind; currency: string }
  /** `ticker.<instrument>.<interval>`: mark price, mark/bid/ask IV, greeks. */
  | { kind: 'ticker'; instrument: string }
  /** `deribit_volatility_index.<index>`: DVOL, e.g. `btc_usd`. */
  | { kind: 'volatilityIndex'; index: string }
  /** `deribit_price_index.<index>`, e.g. `btc_usd`. */
  | { kind: 'priceIndex'; index: string }
  /** `markprice.options.<index>`: every option's mark price and IV. */
  | { kind: 'markPrice'; index: string }
  /** Any other channel, by its exact name. Unmodelled data arrives as `unknown`. */
  | { channel: string };

/** Options for {@link DeribitSocket}. */
export type DeribitSocketOptions = FeedSocketOptions & {
  /** @default 'production' */
  environment?: 'production' | 'testnet';
  /** Credentials. Needed for `raw` channels; optional otherwise. */
  auth?: DeribitAuth;
  /**
   * Interval for book/trades/ticker channels. `'finest'` picks `raw` with
   * `auth` and `100ms` without. Explicit `'raw'` without `auth` is a
   * configuration error. @default 'finest'
   */
  interval?: DeribitInterval | 'finest';
  /** Subscriptions to open from the start. */
  subscriptions?: DeribitSubscription[];
  /** Interval Deribit sends heartbeats at (`public/set_heartbeat`), 10–3600 s. @default 10 */
  heartbeatSeconds?: number;
  /** Give up on an unanswered `public/auth` after this long and reconnect. @default 10000 */
  authTimeoutMs?: number;
};

/** The channel a data event came from. */
export type DeribitChannelField = { channel: string };

/** Every data event a {@link DeribitSocket} yields besides the lifecycle ones. */
export type DeribitSocketDataEvent =
  | (FeedDataEvent<'book', DeribitBookUpdateSchema> & DeribitChannelField)
  | (FeedDataEvent<'trade', DeribitTradeSchema> & DeribitChannelField)
  | (FeedDataEvent<'ticker', DeribitTickerSchema> & DeribitChannelField)
  | (
    & FeedDataEvent<'volatilityIndex', DeribitVolatilityIndexSchema>
    & DeribitChannelField
  )
  | (FeedDataEvent<'priceIndex', DeribitPriceIndexSchema> & DeribitChannelField)
  | (FeedDataEvent<'markPrice', DeribitMarkPriceSchema> & DeribitChannelField)
  /** Deribit confirmed these channels. */
  | (FeedEventBase & { type: 'subscribed'; channels: string[] })
  /** Deribit confirmed these channels are closed. */
  | (FeedEventBase & { type: 'unsubscribed'; channels: string[] })
  /** The connection authenticated (also after every reconnect and token refresh). */
  | (FeedEventBase & {
    type: 'authenticated';
    scope: string;
    expiresIn: number;
    refreshed: boolean;
  });

/** Everything iterating a {@link DeribitSocket} can yield. */
export type DeribitSocketEvent =
  | DeribitSocketDataEvent
  | FeedLifecycleEvent<DeribitError>;

type Rpc = {
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

type Pending = {
  method: string;
  channels?: string[];
  resolve?: (answer: Rpc | 'closed' | 'timeout') => void;
};

const BATCH_SIZE = 100;

/**
 * The Deribit channel name for a subscription.
 *
 * @example
 * ```ts
 * import { deribitChannel } from '@tundraconnect/deribit/sockets';
 *
 * deribitChannel({ kind: 'book', instrument: 'BTC-PERPETUAL' }, '100ms'); // 'book.BTC-PERPETUAL.100ms'
 * deribitChannel({ kind: 'trades', instrumentKind: 'option', currency: 'BTC' }, 'raw'); // 'trades.option.BTC.raw'
 * ```
 */
export function deribitChannel(
  sub: DeribitSubscription,
  interval: DeribitInterval,
): string {
  if ('channel' in sub) return sub.channel;
  switch (sub.kind) {
    case 'book':
      return `book.${sub.instrument}.${interval}`;
    case 'trades':
      return 'instrument' in sub
        ? `trades.${sub.instrument}.${interval}`
        : `trades.${sub.instrumentKind}.${sub.currency}.${interval}`;
    case 'ticker':
      return `ticker.${sub.instrument}.${interval}`;
    case 'volatilityIndex':
      return `deribit_volatility_index.${sub.index}`;
    case 'priceIndex':
      return `deribit_price_index.${sub.index}`;
    case 'markPrice':
      return `markprice.options.${sub.index}`;
  }
}

/**
 * Deribit market-data feed over the JSON-RPC WebSocket.
 *
 * @example
 * ```ts
 * import { DeribitSocket } from '@tundraconnect/deribit/sockets';
 *
 * const socket = new DeribitSocket({
 *   subscriptions: [
 *     { kind: 'ticker', instrument: 'BTC-7NOV26-76000-C' },
 *     { kind: 'volatilityIndex', index: 'btc_usd' },
 *     { kind: 'book', instrument: 'BTC-PERPETUAL' },
 *   ],
 * });
 * for await (const event of socket) {
 *   if (event.type === 'ticker') console.log(event.data.markIv, event.data.greeks?.delta);
 *   if (event.type === 'gap') console.warn('missed updates on', event.stream);
 * }
 * ```
 */
export class DeribitSocket
  extends FeedSocket<DeribitSocketDataEvent, DeribitError> {
  public readonly feed = 'deribit';
  /** The interval book/trades/ticker channels use on this socket. */
  public readonly interval: DeribitInterval;

  readonly #auth?: DeribitAuth;
  readonly #environment: 'production' | 'testnet';
  readonly #heartbeatSeconds: number;
  readonly #authTimeoutMs: number;
  readonly #channels = new Set<string>();
  /** Book channel → last `change_id` seen. */
  readonly #books = new Map<string, number>();
  /** Trades channel → instruments it has sequenced. */
  readonly #tradeStreams = new Map<string, Set<string>>();
  #pending = new Map<number, Pending>();
  #nextId = 1;
  #refreshTimer?: ReturnType<typeof setTimeout>;
  #refreshToken?: string;

  /**
   * @throws {DeribitError} `CONFIG_INVALID_AUTH` for malformed `auth`,
   * `CONFIG_RAW_REQUIRES_AUTH` for `interval: 'raw'` without `auth`,
   * `CONFIG_INVALID_OPTION` for a bad environment or heartbeat.
   */
  constructor(options: DeribitSocketOptions = {}) {
    const heartbeatSeconds = options.heartbeatSeconds ?? 10;
    super({
      heartbeatIntervalMs: 0,
      idleTimeoutMs: heartbeatSeconds * 3_000,
      ...options,
    });
    this._sendIntervalMs = 50;
    const auth = options.auth;
    if (
      auth !== undefined &&
      (auth.type !== 'CUSTOM' || typeof auth.clientId !== 'string' ||
        auth.clientId.trim() === '' ||
        typeof auth.clientSecret !== 'string' ||
        auth.clientSecret.trim() === '')
    ) {
      // Never echo the credentials: an error's context is serialised.
      throw new DeribitError('CONFIG_INVALID_AUTH', {});
    }
    const environment = options.environment ?? 'production';
    if (!(environment in DERIBIT_WS_URLS)) {
      throw new DeribitError('CONFIG_INVALID_OPTION', {
        option: 'environment',
        reason: "expected 'production' or 'testnet'",
      });
    }
    if (
      !Number.isInteger(heartbeatSeconds) || heartbeatSeconds < 10 ||
      heartbeatSeconds > 3600
    ) {
      throw new DeribitError('CONFIG_INVALID_OPTION', {
        option: 'heartbeatSeconds',
        reason: 'expected an integer from 10 to 3600',
      });
    }
    const requested = options.interval ?? 'finest';
    if (requested === 'raw' && !auth) {
      throw new DeribitError('CONFIG_RAW_REQUIRES_AUTH', {});
    }
    this.interval = requested === 'finest'
      ? (auth ? 'raw' : '100ms')
      : requested;
    this.#auth = auth && {
      type: 'CUSTOM',
      clientId: auth.clientId.trim(),
      clientSecret: auth.clientSecret.trim(),
    };
    this.#environment = environment;
    this.#heartbeatSeconds = heartbeatSeconds;
    this.#authTimeoutMs = options.authTimeoutMs ?? 10_000;
    for (const sub of options.subscriptions ?? []) {
      this.#channels.add(deribitChannel(sub, this.interval));
    }
  }

  /** Whether credentials are configured. They are never readable back. */
  public get hasCredentials(): boolean {
    return this.#auth !== undefined;
  }

  /** Channels currently wanted, e.g. `book.BTC-PERPETUAL.raw`. */
  public get channels(): string[] {
    return [...this.#channels];
  }

  /** Add subscriptions. Channels already open are ignored. */
  public subscribe(subs: DeribitSubscription[]): void {
    const added = subs.map((s) => deribitChannel(s, this.interval)).filter(
      (c) => {
        if (this.#channels.has(c)) return false;
        this.#channels.add(c);
        return true;
      },
    );
    if (added.length === 0) return;
    this._touchData();
    this.#subscribe(added);
  }

  /** Remove subscriptions. */
  public unsubscribe(subs: DeribitSubscription[]): void {
    const removed = subs.map((s) => deribitChannel(s, this.interval)).filter(
      (c) => this.#channels.delete(c),
    );
    if (removed.length === 0) return;
    for (const channel of removed) {
      this.#books.delete(channel);
      for (const instrument of this.#tradeStreams.get(channel) ?? []) {
        this._forgetSequence(`${channel}|${instrument}`);
      }
      this.#tradeStreams.delete(channel);
    }
    const method = this.#auth ? 'private/unsubscribe' : 'public/unsubscribe';
    for (let i = 0; i < removed.length; i += BATCH_SIZE) {
      const channels = removed.slice(i, i + BATCH_SIZE);
      this.#call(method, { channels }, { method, channels });
    }
  }

  protected _error(
    code: FeedSocketErrorCode | DeribitErrorCode,
    meta?: Record<string, unknown>,
    cause?: Error,
  ): DeribitError {
    return new DeribitError(code, meta, cause);
  }

  protected _url(): string {
    return this._options.url ?? DERIBIT_WS_URLS[this.#environment];
  }

  protected override _hasSubscriptions(): boolean {
    return this.#channels.size > 0;
  }

  protected async _onOpen(): Promise<void> {
    if (this.#auth) {
      const ok = await this.#authenticate(false);
      if (!ok) return;
    }
    this.#call('public/set_heartbeat', {
      interval: this.#heartbeatSeconds,
    }, { method: 'public/set_heartbeat' });
    this.#subscribe([...this.#channels]);
  }

  protected override _onSessionEnd(): void {
    if (this.#refreshTimer) clearTimeout(this.#refreshTimer);
    this.#refreshTimer = undefined;
    this.#refreshToken = undefined;
    // A resubscription starts each book with a fresh snapshot.
    this.#books.clear();
    for (const pending of this.#pending.values()) pending.resolve?.('closed');
    this.#pending.clear();
  }

  protected _onText(text: string, receivedAt: number): boolean {
    const base = this._base(receivedAt, text);
    let frame: Record<string, unknown>;
    try {
      frame = parseJsonLossless(text) as Record<string, unknown>;
    } catch {
      this._emitError(
        this._error('SOCKET_VENUE_ERROR', { feed: this.feed, detail: text }),
        receivedAt,
      );
      return false;
    }
    if (typeof frame !== 'object' || frame === null) {
      this._emit({ ...base, type: 'unknown', data: frame });
      return true;
    }
    if (
      typeof frame.id === 'number' && ('result' in frame || 'error' in frame)
    ) {
      this.#answer(frame as Rpc, base);
      return false;
    }
    if (frame.method === 'heartbeat') {
      const params = frame.params as { type?: string } | undefined;
      if (params?.type === 'test_request') {
        this.#call('public/test', {}, { method: 'public/test' });
      }
      return false;
    }
    if (frame.method === 'subscription') {
      const params = frame.params as
        | { channel?: unknown; data?: unknown }
        | undefined;
      if (typeof params?.channel === 'string') {
        this.#notification(params.channel, params.data, base);
        return true;
      }
    }
    this._emit({ ...base, type: 'unknown', data: frame });
    return true;
  }

  /** One `subscription` notification. */
  #notification(channel: string, data: unknown, base: FeedEventBase): void {
    const parts = channel.split('.');
    const head = parts[0];
    if (head === 'book' && parts.length === 3) {
      const book = this._parse(
        DeribitBookUpdateSchemaObject,
        data,
        'book',
        base,
      );
      if (!book) return;
      const last = this.#books.get(channel);
      if (
        book.type === 'change' && last !== undefined &&
        book.prevChangeId !== undefined && book.prevChangeId !== last
      ) {
        this._emit({
          ...base,
          type: 'gap',
          stream: channel,
          expected: last,
          received: book.prevChangeId,
        });
      }
      this.#books.set(channel, book.changeId);
      this._emit({
        ...base,
        type: 'book',
        channel,
        venueTimestamp: book.timestamp,
        data: book,
      });
      return;
    }
    if (head === 'trades' && Array.isArray(data)) {
      for (const raw of data) {
        const trade = this._parse(
          DeribitTradeSchemaObject,
          raw,
          'trades',
          base,
        );
        if (!trade) continue;
        let seen = this.#tradeStreams.get(channel);
        if (!seen) this.#tradeStreams.set(channel, seen = new Set());
        seen.add(trade.instrumentName);
        this._sequence(
          `${channel}|${trade.instrumentName}`,
          trade.tradeSeq,
          trade.tradeSeq,
          base,
        );
        this._emit({
          ...base,
          type: 'trade',
          channel,
          venueTimestamp: trade.timestamp,
          data: trade,
        });
      }
      return;
    }
    if (head === 'ticker') {
      const ticker = this._parse(
        DeribitTickerSchemaObject,
        data,
        'ticker',
        base,
      );
      if (ticker) {
        this._emit({
          ...base,
          type: 'ticker',
          channel,
          venueTimestamp: ticker.timestamp,
          data: ticker,
        });
      }
      return;
    }
    if (head === 'deribit_volatility_index') {
      const v = this._parse(
        DeribitVolatilityIndexSchemaObject,
        data,
        'deribit_volatility_index',
        base,
      );
      if (v) {
        this._emit({
          ...base,
          type: 'volatilityIndex',
          channel,
          venueTimestamp: v.timestamp,
          data: v,
        });
      }
      return;
    }
    if (head === 'deribit_price_index') {
      const p = this._parse(
        DeribitPriceIndexSchemaObject,
        data,
        'deribit_price_index',
        base,
      );
      if (p) {
        this._emit({
          ...base,
          type: 'priceIndex',
          channel,
          venueTimestamp: p.timestamp,
          data: p,
        });
      }
      return;
    }
    if (head === 'markprice' && Array.isArray(data)) {
      for (const raw of data) {
        const m = this._parse(
          DeribitMarkPriceSchemaObject,
          raw,
          'markprice',
          base,
        );
        if (m) {
          this._emit({
            ...base,
            type: 'markPrice',
            channel,
            venueTimestamp: m.timestamp,
            data: m,
          });
        }
      }
      return;
    }
    this._emit({ ...base, type: 'unknown', data: { channel, data } });
  }

  /** A response to one of our requests. */
  #answer(frame: Rpc, base: FeedEventBase): void {
    const pending = this.#pending.get(frame.id!);
    if (!pending) return;
    this.#pending.delete(frame.id!);
    if (pending.resolve) {
      pending.resolve(frame);
      return;
    }
    const error = frame.error;
    if (error) {
      const subscribing = pending.method.endsWith('/subscribe');
      this._emitError(
        this._error(
          subscribing ? 'SOCKET_SUBSCRIBE_FAILED' : 'SOCKET_VENUE_ERROR',
          {
            feed: this.feed,
            detail: `${pending.method}: ${
              error.message ?? 'error'
            } (code ${error.code})${
              pending.channels ? ` for ${pending.channels.join(', ')}` : ''
            }`,
            vendorCode: error.code,
            vendorMessage: error.message,
            vendorData: error.data,
            method: pending.method,
            channels: pending.channels,
          },
        ),
        base.receivedAt,
      );
      return;
    }
    if (pending.method.endsWith('/subscribe') && Array.isArray(frame.result)) {
      this._emit({
        ...base,
        type: 'subscribed',
        channels: frame.result as string[],
      });
    } else if (
      pending.method.endsWith('/unsubscribe') && Array.isArray(frame.result)
    ) {
      this._emit({
        ...base,
        type: 'unsubscribed',
        channels: frame.result as string[],
      });
    }
  }

  /**
   * Authenticate this connection (client credentials, or the refresh token
   * when `refresh`). A refusal is fatal; a timeout reconnects.
   */
  async #authenticate(refresh: boolean): Promise<boolean> {
    const auth = this.#auth!;
    const params = refresh && this.#refreshToken
      ? { grant_type: 'refresh_token', refresh_token: this.#refreshToken }
      : {
        grant_type: 'client_credentials',
        client_id: auth.clientId,
        client_secret: auth.clientSecret,
      };
    const answer = await new Promise<Rpc | 'closed' | 'timeout'>((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), this.#authTimeoutMs);
      const sent = this.#call('public/auth', params, {
        method: 'public/auth',
        resolve: (a) => {
          clearTimeout(timer);
          resolve(a);
        },
      });
      if (!sent) {
        clearTimeout(timer);
        resolve('closed');
      }
    });
    if (answer === 'closed') return false;
    if (answer === 'timeout') {
      this._reconnect('public/auth timed out');
      return false;
    }
    if (answer.error) {
      if (refresh) {
        // The refresh token was refused: start over with the key.
        this._reconnect(`token refresh failed: ${answer.error.message}`);
        return false;
      }
      this._fail(
        this._error('SOCKET_AUTH_FAILED', {
          feed: this.feed,
          detail: `${
            answer.error.message ?? 'refused'
          } (code ${answer.error.code})`,
          vendorCode: answer.error.code,
        }),
      );
      return false;
    }
    const [error, result] = DeribitAuthResultSchemaObject.safeParse(
      answer.result,
    );
    if (error || !result) {
      this._fail(
        this._error('SOCKET_AUTH_FAILED', {
          feed: this.feed,
          detail: 'unexpected public/auth result',
        }),
      );
      return false;
    }
    this.#scheduleRefresh(result);
    this._emit({
      type: 'authenticated',
      receivedAt: this._now(),
      scope: result.scope,
      expiresIn: result.expiresIn,
      refreshed: refresh,
    });
    return true;
  }

  #scheduleRefresh(result: DeribitAuthResultSchema): void {
    this.#refreshToken = result.refreshToken;
    if (this.#refreshTimer) clearTimeout(this.#refreshTimer);
    const ms = Math.max(1_000, result.expiresIn * 1_000 * 0.8);
    this.#refreshTimer = setTimeout(() => {
      this.#refreshTimer = undefined;
      void this.#authenticate(true);
    }, ms);
  }

  #subscribe(channels: string[]): void {
    const method = this.#auth ? 'private/subscribe' : 'public/subscribe';
    for (let i = 0; i < channels.length; i += BATCH_SIZE) {
      const batch = channels.slice(i, i + BATCH_SIZE);
      this.#call(method, { channels: batch }, { method, channels: batch });
    }
  }

  /** Send one request; returns `false` (nothing sent) while disconnected. */
  #call(
    method: string,
    params: Record<string, unknown>,
    pending: Pending,
  ): boolean {
    const id = this.#nextId++;
    const sent = this._send(
      JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    );
    if (sent) this.#pending.set(id, pending);
    return sent;
  }
}
