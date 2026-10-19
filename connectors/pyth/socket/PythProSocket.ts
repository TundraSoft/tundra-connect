/**
 * @fileoverview Pyth Pro (formerly Pyth Lazer) price stream over all of its
 * redundant WebSocket endpoints at once.
 *
 * Wire protocol (docs.pyth.network → Pyth Pro, and the official SDK):
 *
 * - Endpoints `wss://pyth-lazer-{0,1,2}.dourolabs.app/v1/stream`. Pyth says
 *   to connect to ALL of them, because any one restarts briefly during
 *   deployments.
 * - Auth: the access token rides the handshake as the WebSocket subprotocol
 *   pair `pyth-lazer-auth, <token>` — works on every runtime, browsers and
 *   Workers included — or as `Authorization: Bearer <token>`.
 * - `{ type: 'subscribe', subscriptionId, priceFeedIds | symbols,
 *   properties, formats, channel, deliveryFormat, parsed, ... }` and
 *   `{ type: 'unsubscribe', subscriptionId }`. Updates arrive as
 *   `streamUpdated` frames: `parsed.timestampUs` plus one entry per feed.
 * - The server pings at the WebSocket level (the runtime answers but
 *   can't report it); a subscribed stream that goes quiet is reconnected.
 *
 * This socket holds one connection per endpoint, each with its own
 * reconnect, backoff and liveness, sends every subscription change to all
 * of them, and merges what they deliver into ONE stream: a feed's update
 * is identified by `priceFeedId` + `timestampUs`, and the first copy to
 * arrive wins. `emitDuplicates: true` emits every copy instead, tagged
 * with its endpoint and the first copy's arrival, for latency research.
 * Nothing else is merged, sampled or dropped.
 *
 * @module
 */

import { PythError } from '../errors/mod.ts';
import type {
  PythBinaryPayload,
  PythPriceFeedUpdate,
  PythStreamUpdate,
  PythSubscribed,
} from '../schema/mod.ts';
import type {
  FeedEventBase,
  FeedLifecycleEvent,
  FeedReconnectOptions,
  WebSocketFactory,
} from './FeedSocket.ts';
import {
  type PythEndpointMessage,
  PythEndpointSocket,
} from './PythEndpointSocket.ts';

/** The three redundant production endpoints, as documented. */
export const PYTH_PRO_ENDPOINTS: readonly string[] = [
  'wss://pyth-lazer-0.dourolabs.app/v1/stream',
  'wss://pyth-lazer-1.dourolabs.app/v1/stream',
  'wss://pyth-lazer-2.dourolabs.app/v1/stream',
];

/** Every price property Pyth Pro offers — the default for a subscription. */
export const PYTH_PRO_PROPERTIES = [
  'price',
  'bestBidPrice',
  'bestAskPrice',
  'exponent',
  'publisherCount',
  'confidence',
  'fundingRate',
  'fundingTimestamp',
  'fundingRateInterval',
  'marketSession',
  'emaPrice',
  'emaConfidence',
  'feedUpdateTimestamp',
] as const;

/** A price property. */
export type PythProProperty = (typeof PYTH_PRO_PROPERTIES)[number];

/**
 * `real_time` sends a new price as soon as it exists (every 1–50 ms);
 * `fixed_rate@…` at a fixed cadence. Each feed supports its `min_channel`
 * and anything slower.
 */
export type PythProChannel =
  | 'real_time'
  | 'fixed_rate@50ms'
  | 'fixed_rate@200ms'
  | 'fixed_rate@1000ms';

/** A signed on-chain payload format (`leUnsigned` is unsigned, for off-chain use). */
export type PythProFormat =
  | 'evm'
  | 'solana'
  | 'leEcdsa'
  | 'leUnsigned'
  | 'packedEvmEcdsa';

/** One subscription. Name feeds by id or by symbol (or both). */
export type PythProSubscription = {
  priceFeedIds?: number[];
  /** e.g. `Crypto.BTC/USD`. */
  symbols?: string[];
  /** @default every property — {@link PYTH_PRO_PROPERTIES} */
  properties?: PythProProperty[];
  /** @default the socket's `channel` option (itself `'real_time'`) */
  channel?: PythProChannel;
  /** Signed payloads to include as `signed_update` events. @default [] (parsed JSON only) */
  formats?: PythProFormat[];
  /** Encoding of signed payloads. @default 'hex' (the venue's default) */
  jsonBinaryEncoding?: 'hex' | 'base64';
  /** Skip unknown/unsupported feeds instead of failing the subscription; they are listed on the `subscribed` event. @default true */
  ignoreInvalidFeedIds?: boolean;
};

/** Options for {@link PythProSocket}. */
export type PythProSocketOptions = {
  /** The access token from your Pyth Pro distributor — same shape as every connect's `auth`. */
  auth: { type: 'BEARER'; token: string };
  /** @default {@link PYTH_PRO_ENDPOINTS} — all three */
  endpoints?: readonly string[];
  /**
   * How the token travels in the handshake. `'subprotocol'` works on every
   * runtime (browsers and Workers too); `'header'` sends `Authorization:
   * Bearer`, which needs a runtime that can set WebSocket headers.
   * @default 'subprotocol'
   */
  authTransport?: 'subprotocol' | 'header';
  /** Default channel for subscriptions. @default 'real_time' */
  channel?: PythProChannel;
  /** Subscriptions to open from the start. */
  subscriptions?: PythProSubscription[];
  /** Emit every endpoint's copy of an update, not just the first. @default false */
  emitDuplicates?: boolean;
  /** How long an update's identity is remembered for merging. @default 60000 */
  dedupeWindowMs?: number;
  /** Attach the exact frame text to each event as `raw`. @default false */
  includeRaw?: boolean;
  /** Receive-time clock, read on arrival before parsing. @default Date.now */
  clock?: () => number;
  signal?: AbortSignal;
  /** Per-endpoint reconnect policy. */
  reconnect?: FeedReconnectOptions | false;
  connectTimeoutMs?: number;
  /** Reconnect an endpoint whose subscribed stream sends nothing for this long. @default 5000 */
  dataTimeoutMs?: number;
  idleTimeoutMs?: number;
  maxBufferedEvents?: number;
  /** Receives `Authorization: Bearer <token>` in `init.headers` to apply itself. */
  webSocket?: WebSocketFactory;
};

/** Overall health across the endpoints. */
export type PythProHealth = 'up' | 'degraded' | 'down';

/** Which endpoint delivered an event. */
export type PythEndpointField = { endpoint: string };

/** One feed's price update — merged across endpoints by `priceFeedId` + `timestampUs`. */
export type PythProPriceEvent = FeedEventBase & PythEndpointField & {
  type: 'price';
  subscriptionId: number;
  /** The update's Pyth timestamp, Unix µs. */
  timestampUs: number;
  /** Same as `timestampUs` (µs). */
  venueTimestamp: number;
  data: PythPriceFeedUpdate;
  /** `true` on a later endpoint's copy (only with `emitDuplicates`). */
  duplicate: boolean;
  /** On a duplicate: where and when the first copy arrived. */
  firstSeen?: { endpoint: string; receivedAt: number };
};

/** The signed payloads of one update (only when a subscription asks for `formats`). */
export type PythProSignedUpdateEvent = FeedEventBase & PythEndpointField & {
  type: 'signed_update';
  subscriptionId: number;
  timestampUs?: number;
  venueTimestamp?: number;
  data: Partial<Record<PythProFormat, PythBinaryPayload>>;
  duplicate: boolean;
  firstSeen?: { endpoint: string; receivedAt: number };
};

/** One endpoint acknowledged a subscription (each endpoint acks separately). */
export type PythProSubscribedEvent = FeedEventBase & PythEndpointField & {
  type: 'subscribed';
  data: PythSubscribed;
};

/** One endpoint confirmed an unsubscribe. */
export type PythProUnsubscribedEvent = FeedEventBase & PythEndpointField & {
  type: 'unsubscribed';
  subscriptionId: number;
};

/** The overall state changed. `down` (no endpoint up) means the stream is stale. */
export type PythProHealthEvent = FeedEventBase & {
  type: 'health';
  state: PythProHealth;
  endpointsUp: number;
  endpointsTotal: number;
};

/** A lifecycle event of one endpoint (`connected`, `disconnected`, `error`, …), tagged with it. */
export type PythProEndpointLifecycleEvent =
  & Exclude<FeedLifecycleEvent<PythError>, { type: 'gap' }>
  & PythEndpointField;

/** A gap in the MERGED stream (fixed-rate channels): ticks no endpoint delivered. */
export type PythProGapEvent = Extract<
  FeedLifecycleEvent<PythError>,
  { type: 'gap' }
>;

/** Everything iterating a {@link PythProSocket} can yield. */
export type PythProSocketEvent =
  | PythProPriceEvent
  | PythProSignedUpdateEvent
  | PythProSubscribedEvent
  | PythProUnsubscribedEvent
  | PythProHealthEvent
  | PythProGapEvent
  | PythProEndpointLifecycleEvent;

const FORMAT_KEYS: readonly PythProFormat[] = [
  'evm',
  'solana',
  'leEcdsa',
  'leUnsigned',
  'packedEvmEcdsa',
];

const PERIOD_US: Partial<Record<PythProChannel, number>> = {
  'fixed_rate@50ms': 50_000,
  'fixed_rate@200ms': 200_000,
  'fixed_rate@1000ms': 1_000_000,
};

type Seen = { endpoint: string; receivedAt: number };

/**
 * Pyth Pro prices from every endpoint at once, merged into one stream.
 *
 * @example
 * ```ts
 * import { PythProSocket } from '@tundraconnect/pyth/sockets';
 *
 * const socket = new PythProSocket({
 *   auth: { type: 'BEARER', token: '<access token>' },
 *   subscriptions: [{ symbols: ['Crypto.BTC/USD', 'Crypto.ETH/USD'] }],
 * });
 * for await (const event of socket) {
 *   if (event.type === 'price') {
 *     const { priceFeedId, price, exponent } = event.data;
 *     console.log(priceFeedId, price, exponent, event.endpoint, event.timestampUs);
 *   }
 *   if (event.type === 'health' && event.state === 'down') console.warn('stale');
 * }
 * ```
 */
export class PythProSocket implements AsyncIterable<PythProSocketEvent> {
  readonly #options: PythProSocketOptions;
  readonly #endpoints: PythEndpointSocket[];
  readonly #urls: string[];
  readonly #requests = new Map<number, Record<string, unknown>>();
  readonly #channels = new Map<number, PythProChannel>();
  readonly #up = new Set<string>();
  readonly #seen = new Map<string, Seen>();
  readonly #seenOrder: { key: string; at: number }[] = [];
  readonly #lastTs = new Map<number, number>();
  #nextId = 1;
  #health: PythProHealth = 'down';
  #queue: PythProSocketEvent[] = [];
  #waiters: ((r: IteratorResult<PythProSocketEvent>) => void)[] = [];
  #iterating = false;
  #started = false;
  #closed = false;
  #finished = false;
  #pumps: Promise<void>[] = [];

  /**
   * @throws {PythError} `SOCKET_MISSING_CREDENTIALS` without a token,
   * `SOCKET_INVALID_SUBSCRIPTION` for an initial subscription naming no
   * feeds or an empty endpoint list.
   */
  constructor(options: PythProSocketOptions) {
    const token = options.auth?.token;
    if (!token) throw new PythError('SOCKET_MISSING_CREDENTIALS');
    this.#options = options;
    this.#urls = [...(options.endpoints ?? PYTH_PRO_ENDPOINTS)];
    if (this.#urls.length === 0) {
      throw new PythError('SOCKET_INVALID_SUBSCRIPTION', {
        detail: 'at least one endpoint is required',
      });
    }
    for (const sub of options.subscriptions ?? []) this.#add(sub);
    const requests = () => [...this.#requests.values()];
    this.#endpoints = this.#urls.map((url) =>
      new PythEndpointSocket(
        {
          url,
          token,
          authTransport: options.authTransport ?? 'subprotocol',
          requests,
        },
        {
          includeRaw: options.includeRaw,
          clock: options.clock,
          reconnect: options.reconnect,
          connectTimeoutMs: options.connectTimeoutMs,
          dataTimeoutMs: options.dataTimeoutMs ?? 5_000,
          idleTimeoutMs: options.idleTimeoutMs,
          maxBufferedEvents: options.maxBufferedEvents,
          webSocket: options.webSocket,
        },
      )
    );
    const signal = options.signal;
    if (signal?.aborted) this.#closed = true;
    else {signal?.addEventListener('abort', () => void this.close(), {
        once: true,
      });}
  }

  /** `up` (every endpoint connected), `degraded` (some) or `down` (none — stale). */
  public get health(): PythProHealth {
    return this.#health;
  }

  /** The endpoints currently connected. */
  public get endpointsUp(): string[] {
    return this.#urls.filter((u) => this.#up.has(u));
  }

  /**
   * Add a subscription on every endpoint; returns its id. Sent now to the
   * connected endpoints and replayed on every (re)connect.
   *
   * @throws {PythError} `SOCKET_INVALID_SUBSCRIPTION` when it names no feeds.
   */
  public subscribe(subscription: PythProSubscription): number {
    const id = this.#add(subscription);
    const body = this.#requests.get(id)!;
    for (const endpoint of this.#endpoints) endpoint.request(body);
    return id;
  }

  /** Remove a subscription on every endpoint. */
  public unsubscribe(subscriptionId: number): void {
    if (!this.#requests.delete(subscriptionId)) return;
    this.#channels.delete(subscriptionId);
    this.#lastTs.delete(subscriptionId);
    for (const endpoint of this.#endpoints) {
      endpoint.request({ type: 'unsubscribe', subscriptionId });
    }
  }

  /**
   * Connect every endpoint. Resolves when the first one is up; rejects
   * only if every endpoint fails fatally first.
   *
   * @throws {PythError} `SOCKET_CLOSED` after {@link close}, or the last
   * endpoint's fatal error.
   */
  public async connect(): Promise<void> {
    if (this.#closed) {
      throw new PythError('SOCKET_CLOSED', { feed: 'pyth-pro' });
    }
    this.#start();
    try {
      await Promise.any(this.#endpoints.map((e) => e.connect()));
    } catch (err) {
      const errors = (err as AggregateError).errors ?? [err];
      throw errors.at(-1);
    }
  }

  /** Close every endpoint. Buffered events stay readable. Idempotent. */
  public async close(): Promise<void> {
    if (this.#closed && !this.#started) {
      this.#finish();
      return;
    }
    this.#closed = true;
    await Promise.all(this.#endpoints.map((e) => e.close()));
    await Promise.all(this.#pumps);
    this.#finish();
  }

  /**
   * The merged event stream. Starts every endpoint if needed; breaking out
   * of a `for await` closes the socket. One iterator at a time.
   *
   * @throws {PythError} `SOCKET_IN_USE` for a second concurrent iterator.
   */
  public [Symbol.asyncIterator](): AsyncIterator<PythProSocketEvent> {
    if (this.#iterating) {
      throw new PythError('SOCKET_IN_USE', { feed: 'pyth-pro' });
    }
    this.#iterating = true;
    if (!this.#closed) this.#start();
    else if (!this.#started) this.#finish();
    return {
      next: () => {
        const event = this.#queue.shift();
        if (event) return Promise.resolve({ value: event, done: false });
        if (this.#finished) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => this.#waiters.push(resolve));
      },
      return: async () => {
        this.#iterating = false;
        await this.close();
        return { value: undefined, done: true };
      },
    };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  #add(sub: PythProSubscription): number {
    if (!sub.priceFeedIds?.length && !sub.symbols?.length) {
      throw new PythError('SOCKET_INVALID_SUBSCRIPTION', {
        detail: 'name at least one feed in priceFeedIds or symbols',
      });
    }
    const id = this.#nextId++;
    const channel = sub.channel ?? this.#options.channel ?? 'real_time';
    const body: Record<string, unknown> = {
      type: 'subscribe',
      subscriptionId: id,
      properties: sub.properties ?? [...PYTH_PRO_PROPERTIES],
      formats: sub.formats ?? [],
      deliveryFormat: 'json',
      parsed: true,
      channel,
      ignoreInvalidFeedIds: sub.ignoreInvalidFeedIds ?? true,
    };
    if (sub.priceFeedIds?.length) body.priceFeedIds = sub.priceFeedIds;
    if (sub.symbols?.length) body.symbols = sub.symbols;
    if (sub.jsonBinaryEncoding) {
      body.jsonBinaryEncoding = sub.jsonBinaryEncoding;
    }
    this.#requests.set(id, body);
    this.#channels.set(id, channel);
    return id;
  }

  #start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#pumps = this.#endpoints.map(async (endpoint, i) => {
      const url = this.#urls[i]!;
      for await (const event of endpoint) this.#handle(url, event);
      this.#setUp(url, false);
    });
    void Promise.all(this.#pumps).then(() => {
      if (!this.#closed) {
        // Every endpoint stopped for good on its own (fatal errors).
        this.#closed = true;
      }
      this.#finish();
    });
  }

  #handle(
    url: string,
    event: PythEndpointMessage | FeedLifecycleEvent<PythError>,
  ): void {
    switch (event.type) {
      case 'stream':
        this.#onStream(url, event);
        return;
      case 'subscribed':
        this.#emit({ ...event, endpoint: url });
        return;
      case 'unsubscribed':
        this.#emit({ ...event, endpoint: url });
        return;
      case 'connected':
        this.#emit({ ...event, endpoint: url });
        this.#setUp(url, true);
        return;
      case 'disconnected':
        this.#emit({ ...event, endpoint: url });
        this.#setUp(url, false);
        return;
      case 'gap':
        return; // Endpoints track no sequences; gaps are judged on the merged stream.
      default:
        this.#emit({ ...event, endpoint: url });
    }
  }

  #onStream(
    url: string,
    event: FeedEventBase & { data: PythStreamUpdate },
  ): void {
    const { subscriptionId, parsed } = event.data;
    const base: FeedEventBase = event.raw !== undefined
      ? { receivedAt: event.receivedAt, raw: event.raw }
      : { receivedAt: event.receivedAt };
    const ts = parsed?.timestampUs;

    const signed: Partial<Record<PythProFormat, PythBinaryPayload>> = {};
    for (const key of FORMAT_KEYS) {
      const payload = event.data[key];
      if (payload) signed[key] = payload;
    }
    if (Object.keys(signed).length > 0) {
      const first = this.#firstSeen(
        `signed:${subscriptionId}:${ts ?? event.raw ?? event.receivedAt}`,
        url,
        event.receivedAt,
      );
      if (!first || this.#options.emitDuplicates) {
        this.#emit({
          ...base,
          type: 'signed_update',
          endpoint: url,
          subscriptionId,
          ...(ts !== undefined && { timestampUs: ts, venueTimestamp: ts }),
          data: signed,
          duplicate: first !== undefined,
          ...(first && { firstSeen: first }),
        });
      }
    }

    if (!parsed || ts === undefined) return;
    const sightings = parsed.priceFeeds.map((feed) =>
      this.#firstSeen(`${feed.priceFeedId}:${ts}`, url, event.receivedAt)
    );
    // A gap precedes the update that revealed it.
    if (sightings.some((s) => s === undefined)) {
      this.#checkGap(subscriptionId, ts, base);
    }
    parsed.priceFeeds.forEach((feed, i) => {
      const first = sightings[i];
      if (first && !this.#options.emitDuplicates) return;
      this.#emit({
        ...base,
        type: 'price',
        endpoint: url,
        subscriptionId,
        timestampUs: ts,
        venueTimestamp: ts,
        data: feed,
        duplicate: first !== undefined,
        ...(first && { firstSeen: first }),
      });
    });
  }

  /** Records the first sighting of `key`; returns the earlier sighting when this is a copy. */
  #firstSeen(
    key: string,
    endpoint: string,
    receivedAt: number,
  ): Seen | undefined {
    const existing = this.#seen.get(key);
    if (existing) return existing;
    this.#seen.set(key, { endpoint, receivedAt });
    const window = this.#options.dedupeWindowMs ?? 60_000;
    this.#seenOrder.push({ key, at: receivedAt });
    while (
      this.#seenOrder.length > 0 &&
      receivedAt - this.#seenOrder[0]!.at > window
    ) {
      this.#seen.delete(this.#seenOrder.shift()!.key);
    }
    return undefined;
  }

  /** On a fixed-rate channel the merged stream should tick every period. */
  #checkGap(subscriptionId: number, ts: number, base: FeedEventBase): void {
    const period = PERIOD_US[this.#channels.get(subscriptionId) ?? 'real_time'];
    const last = this.#lastTs.get(subscriptionId);
    if (last === undefined || ts > last) this.#lastTs.set(subscriptionId, ts);
    if (!period || last === undefined || ts <= last) return;
    const delta = ts - last;
    if (delta < period * 1.5) return;
    this.#emit({
      ...base,
      type: 'gap',
      stream: `subscription:${subscriptionId}`,
      expected: last + period,
      received: ts,
      missed: Math.round(delta / period) - 1,
    });
  }

  #setUp(url: string, up: boolean): void {
    if (up) this.#up.add(url);
    else this.#up.delete(url);
    const n = this.#up.size;
    const state: PythProHealth = n === 0
      ? 'down'
      : n === this.#urls.length
      ? 'up'
      : 'degraded';
    if (state === this.#health) return;
    this.#health = state;
    this.#emit({
      type: 'health',
      receivedAt: (this.#options.clock ?? Date.now)(),
      state,
      endpointsUp: n,
      endpointsTotal: this.#urls.length,
    });
  }

  #emit(event: PythProSocketEvent): void {
    if (this.#finished) return;
    const waiter = this.#waiters.shift();
    if (waiter) waiter({ value: event, done: false });
    else this.#queue.push(event);
  }

  #finish(): void {
    if (this.#finished) return;
    this.#finished = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }
}
