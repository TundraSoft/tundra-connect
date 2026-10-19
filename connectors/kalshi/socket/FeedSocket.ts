/**
 * @fileoverview `FeedSocket` — the reconnecting WebSocket core behind every
 * market-data/user feed in this connect.
 *
 * VENDORED: an identical copy of this file (and `FeedSocket.test.ts`) lives
 * in every connect that ships a `./sockets` export
 * (`connectors/{binance,kalshi,polymarket}/socket/`). Each connect is
 * published on its own, so they cannot share a module; edit every copy
 * together — `deno task check:socket-core` fails CI when they drift.
 *
 * What it owns, so a venue socket only has to describe its wire protocol:
 *
 * - **Transport.** The global `WebSocket` only (no `ws`, `node:*` or
 *   `Deno.*`), so it runs on Deno, Bun, Node 22+, browsers, Cloudflare
 *   Workers and a bare `deno_core` with the web extensions. Handshake
 *   headers are passed as `new WebSocket(url, { headers })`, which Deno,
 *   Bun and Node accept; a runtime that can't (browsers, Workers) takes a
 *   {@link WebSocketFactory} instead.
 * - **Lifecycle.** Connect, reconnect with jittered exponential backoff,
 *   re-run the venue's auth + full resubscribe on every new connection,
 *   and close cleanly via {@link FeedSocket.close} or an `AbortSignal`.
 * - **Liveness.** An optional venue heartbeat on a timer, an idle watchdog
 *   (no frame of any kind) and a data watchdog (no data frame while
 *   subscribed — the "connected, pongs flowing, but the venue dropped our
 *   subscriptions" zombie). Either one forces a reconnect.
 * - **Delivery.** Every event lands, in arrival order, on one async
 *   iterator. Nothing is sampled, merged or dropped: a buffer overflow is a
 *   fatal, reported error, never a silent loss.
 * - **Honesty.** Every reconnect is a `connected` event with
 *   `reconnected: true`, every disconnect a `disconnected` event, and every
 *   sequence jump a `gap` event — the caller decides when a market is stale
 *   and when to re-snapshot.
 *
 * @module
 */

import type { BaseGuardian, GuardianError } from '@guardian';

/** Connection state of a {@link FeedSocket}. */
export type FeedSocketState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed';

/**
 * Builds the WebSocket for one connection attempt. The default calls the
 * global constructor — `new WebSocket(url)`, or
 * `new WebSocket(url, { headers })` when the venue signs the handshake.
 * Supply your own where the global can't send headers (browsers, Cloudflare
 * Workers) or to route through a proxy.
 *
 * @example
 * ```ts ignore
 * // e.g. a runtime whose WebSocket can't send handshake headers:
 * const webSocket = (url: string) => new WebSocket(url);
 * ```
 */
export type WebSocketFactory = (
  url: string,
  init: { headers?: Record<string, string> },
) => WebSocket;

/** Reconnect policy. `false` on {@link FeedSocketOptions.reconnect} disables reconnecting. */
export type FeedReconnectOptions = {
  /** First delay before reconnecting. @default 1000 */
  initialDelayMs?: number;
  /** Cap on the exponential delay. @default 30000 */
  maxDelayMs?: number;
  /** Give up (fatal `SOCKET_RECONNECT_EXHAUSTED`) after this many consecutive failed attempts. @default Infinity */
  maxAttempts?: number;
  /**
   * A connection that stayed up this long counts as healthy and resets the
   * backoff. Shorter-lived ones keep escalating, so an upstream that accepts
   * connections and then goes silent settles at `maxDelayMs` instead of
   * reconnecting every second. @default 60000
   */
  healthyAfterMs?: number;
};

/** Options every feed socket accepts. Venue sockets add their own on top. */
export type FeedSocketOptions = {
  /** Override the venue's WebSocket URL (a mock server, a regional host). */
  url?: string;
  /** Aborting it closes the socket, exactly like {@link FeedSocket.close}. */
  signal?: AbortSignal;
  /**
   * Attach the exact frame text each event was parsed from as `raw`, so a
   * recorder can store precisely what arrived. Events parsed from one
   * batched frame share the same string. @default false
   */
  includeRaw?: boolean;
  /**
   * Clock for `receivedAt`, read the moment a frame arrives, before it is
   * parsed. @default Date.now — pass
   * `() => performance.timeOrigin + performance.now()` for sub-millisecond
   * receive times.
   */
  clock?: () => number;
  /** Builds each connection's WebSocket. See {@link WebSocketFactory}. */
  webSocket?: WebSocketFactory;
  /** Reconnect policy, or `false` to stop after the first disconnect. */
  reconnect?: FeedReconnectOptions | false;
  /** Abort an attempt whose handshake hasn't completed in this long. @default 15000 */
  connectTimeoutMs?: number;
  /** Reconnect when no frame at all (data, ack or pong) arrives for this long. `0` disables. */
  idleTimeoutMs?: number;
  /**
   * Reconnect when no DATA frame arrives for this long while at least one
   * subscription is active — heartbeats don't count. Off by default because
   * a quiet market is legitimately silent; turn it on for chatty streams.
   * `0` disables.
   */
  dataTimeoutMs?: number;
  /** Send the venue's heartbeat this often. `0` disables. Defaults per venue. */
  heartbeatIntervalMs?: number;
  /**
   * Most events held for a slow consumer. Overflowing it is a fatal
   * `SOCKET_BUFFER_OVERFLOW` (the socket closes) rather than a silent drop.
   * @default Infinity
   */
  maxBufferedEvents?: number;
};

/** Fields every event carries. */
export type FeedEventBase = {
  /** Local receive time (see {@link FeedSocketOptions.clock}), captured before parsing. */
  receivedAt: number;
  /** The exact frame text, when {@link FeedSocketOptions.includeRaw} is on. */
  raw?: string;
};

/**
 * A connection opened and the venue's auth + subscriptions were (re)sent.
 * `reconnected: true` means frames may have been missed since the last
 * `disconnected` — treat every market as stale until its next snapshot.
 */
export type FeedConnectedEvent = FeedEventBase & {
  type: 'connected';
  url: string;
  /** 1 for the first successful connection, then counts up. */
  connection: number;
  reconnected: boolean;
};

/** A connection ended. `reconnectInMs` is absent when no reconnect follows. */
export type FeedDisconnectedEvent = FeedEventBase & {
  type: 'disconnected';
  /** WebSocket close code, when the runtime reported one. */
  code?: number;
  reason: string;
  /** Consecutive failed attempts so far (0 after a healthy connection). */
  attempt: number;
  reconnectInMs?: number;
};

/**
 * A venue sequence or update id jumped. Frames between `expected` and
 * `received` were never seen; nothing has been resynced on your behalf.
 */
export type FeedGapEvent = FeedEventBase & {
  type: 'gap';
  /** What the sequence belongs to — a subscription id, a symbol's stream, ... */
  stream: string;
  /** The id that should have come next. */
  expected: number;
  /** The id that came instead. */
  received: number;
  /**
   * How many frames were lost, when the venue says so directly (a
   * "dropped" counter) rather than through an id jump.
   */
  missed?: number;
};

/**
 * One venue message, validated and normalised. `data` keeps every field
 * the venue sent — modelled ones typed and camelCased, the rest passed
 * through — and `venueTimestamp` repeats the venue's own time for the
 * message, in the venue's unit, when it has one.
 */
export type FeedDataEvent<K extends string, D> = FeedEventBase & {
  type: K;
  venueTimestamp?: number;
  data: D;
};

/** A connection, venue or handler error. `fatal: true` means the socket has closed. */
export type FeedErrorEvent<E extends Error> = FeedEventBase & {
  type: 'error';
  error: E;
  fatal: boolean;
};

/** Valid JSON this socket doesn't model (a new venue message type) — delivered, not dropped. */
export type FeedUnknownEvent = FeedEventBase & {
  type: 'unknown';
  data: unknown;
};

/** A known message type that failed schema validation — delivered with the reason, not dropped. */
export type FeedInvalidEvent<E extends Error> = FeedEventBase & {
  type: 'invalid';
  /** The venue's own type name for the message, when it has one. */
  venueType?: string;
  data: unknown;
  error: E;
};

/** Events every feed socket can emit, whatever the venue. */
export type FeedLifecycleEvent<E extends Error> =
  | FeedConnectedEvent
  | FeedDisconnectedEvent
  | FeedGapEvent
  | FeedErrorEvent<E>
  | FeedUnknownEvent
  | FeedInvalidEvent<E>;

/** Error codes the core raises; every connect with sockets registers them. */
export type FeedSocketErrorCode =
  | 'SOCKET_UNSUPPORTED_RUNTIME'
  | 'SOCKET_RECONNECT_EXHAUSTED'
  | 'SOCKET_BUFFER_OVERFLOW'
  | 'SOCKET_IN_USE'
  | 'SOCKET_CLOSED'
  | 'SOCKET_HANDLER_ERROR'
  | 'SOCKET_INVALID_MESSAGE';

type SessionEnd = { opened: boolean; code?: number; reason: string };

type Waiter<T> = (result: IteratorResult<T>) => void;

const DEFAULT_RECONNECT: Required<FeedReconnectOptions> = {
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  maxAttempts: Infinity,
  healthyAfterMs: 60_000,
};

const decoder = new TextDecoder();

/**
 * The shared reconnecting core. A venue socket extends it, describes its
 * protocol through the `_` hooks, and exposes typed `subscribe`/
 * `unsubscribe` methods; consumers iterate it:
 *
 * ```ts ignore
 * for await (const event of socket) { ... }
 * ```
 *
 * Iteration starts the connection if {@link connect} hasn't; breaking out
 * of the loop closes the socket. Only one iterator may be active.
 *
 * @typeParam T - The venue's own event union.
 * @typeParam E - The connect's error class.
 */
export abstract class FeedSocket<T extends { type: string }, E extends Error>
  implements AsyncIterable<T | FeedLifecycleEvent<E>> {
  /** Short label used in error messages, e.g. `polymarket-market`. */
  public abstract readonly feed: string;

  protected readonly _options: FeedSocketOptions;
  /** Milliseconds between queued outgoing frames — the venue's inbound rate limit. */
  protected _sendIntervalMs = 0;

  #state: FeedSocketState = 'idle';
  #ws?: WebSocket;
  #session = 0;
  #connections = 0;
  #attempt = 0;
  #queue: (T | FeedLifecycleEvent<E>)[] = [];
  #waiters: Waiter<T | FeedLifecycleEvent<E>>[] = [];
  #iterating = false;
  #finished = false;
  #run?: Promise<void>;
  #wake?: () => void;
  #firstOpen?: { resolve: () => void; reject: (e: E) => void };
  #firstOpenPromise?: Promise<void>;
  #outbox: string[] = [];
  #outboxTimer?: ReturnType<typeof setTimeout>;
  #lastSendAt = 0;
  #lastFrameAt = 0;
  #lastDataAt = 0;
  #sequences = new Map<string, number>();
  #pendingFatal?: E;

  constructor(options: FeedSocketOptions = {}) {
    this._options = options;
    const signal = options.signal;
    if (signal) {
      if (signal.aborted) this.#state = 'closed';
      else {
        signal.addEventListener('abort', () => void this.close(), {
          once: true,
        });
      }
    }
  }

  // ── Venue hooks ──────────────────────────────────────────────────────────

  /** The connect's error for `code`. */
  protected abstract _error(
    code: FeedSocketErrorCode,
    meta?: Record<string, unknown>,
    cause?: Error,
  ): E;

  /** The venue URL to connect to for this attempt. */
  protected abstract _url(): string;

  /** Handshake headers, built fresh for every attempt (signed timestamps expire). */
  protected _headers(): Promise<Record<string, string> | undefined> {
    return Promise.resolve(undefined);
  }

  /** Send auth and the FULL current subscription set on a new connection. */
  protected abstract _onOpen(): void | Promise<void>;

  /**
   * Handle one text frame. Emit events through {@link _emit}. Return
   * `false` for a control frame (pong, ack) so it doesn't count as data
   * for the data watchdog; anything else counts as data.
   */
  protected abstract _onText(text: string, receivedAt: number): boolean | void;

  /** Send one heartbeat. Called every `heartbeatIntervalMs` while open. */
  protected _heartbeat(): void {}

  /** Whether any subscription is active — gates the data watchdog. */
  protected _hasSubscriptions(): boolean {
    return false;
  }

  /**
   * Called when an attempt fails before the handshake completed. Return a
   * connect error to stop reconnecting (a geo-block, a refused credential);
   * `undefined` to retry with backoff.
   */
  protected _diagnoseConnectFailure(_url: string): Promise<E | undefined> {
    return Promise.resolve(undefined);
  }

  /** Called when a connection ends: drop per-connection state (sids, pending acks). */
  protected _onSessionEnd(): void {}

  /**
   * Called when an open connection closes. Return an error to stop
   * reconnecting (a close code that means "credentials refused" or "fix
   * the client"); `undefined` to reconnect.
   */
  protected _fatalClose(
    _code: number | undefined,
    _reason: string,
  ): E | undefined {
    return undefined;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** Current connection state. */
  public get state(): FeedSocketState {
    return this.#state;
  }

  /**
   * Start connecting. Resolves once the first connection is open (later
   * reconnects happen in the background); rejects with the connect's
   * error if the socket closes or fails fatally first. Idempotent.
   *
   * @throws The connect's error — `SOCKET_CLOSED` when called after
   * {@link close}, or the fatal error that ended the first attempt.
   */
  public connect(): Promise<void> {
    if (this.#state === 'closed') {
      return this.#firstOpenPromise && !this.#finished
        ? this.#firstOpenPromise
        : Promise.reject(this._error('SOCKET_CLOSED', { feed: this.feed }));
    }
    if (this.#firstOpenPromise) return this.#firstOpenPromise;
    this.#firstOpenPromise = new Promise<void>((resolve, reject) => {
      this.#firstOpen = { resolve, reject };
    });
    // Rejections surface to whoever awaits connect(); never as unhandled.
    this.#firstOpenPromise.catch(() => {});
    this.#state = 'connecting';
    this.#run = this.#loop();
    return this.#firstOpenPromise;
  }

  /**
   * Close the connection and stop reconnecting. Buffered events stay
   * readable; the iterator ends after them. Idempotent.
   */
  public async close(code = 1000, reason = 'closed by client'): Promise<void> {
    if (this.#state === 'closed') {
      await this.#run;
      return;
    }
    this.#state = 'closed';
    this.#endCurrent?.({ code, reason });
    this.#wake?.();
    await this.#run;
    this.#finish(this._error('SOCKET_CLOSED', { feed: this.feed }));
  }

  /**
   * The event stream. Starts the connection if needed. Breaking out of a
   * `for await` closes the socket.
   *
   * @throws The connect's `SOCKET_IN_USE` error when a second iterator is
   * requested while one is active.
   */
  public [Symbol.asyncIterator](): AsyncIterator<T | FeedLifecycleEvent<E>> {
    if (this.#iterating) {
      throw this._error('SOCKET_IN_USE', { feed: this.feed });
    }
    this.#iterating = true;
    if (this.#state === 'idle') void this.connect();
    return {
      next: () => {
        const event = this.#queue.shift();
        if (event !== undefined) {
          return Promise.resolve({ value: event, done: false });
        }
        if (this.#finished) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => {
          this.#waiters.push(resolve);
        });
      },
      return: async () => {
        this.#iterating = false;
        await this.close();
        return { value: undefined, done: true };
      },
    };
  }

  // ── Helpers for venue sockets ────────────────────────────────────────────

  /** Deliver one event. */
  protected _emit(event: T | FeedLifecycleEvent<E>): void {
    if (this.#finished) return;
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter({ value: event, done: false });
      return;
    }
    this.#queue.push(event);
    const max = this._options.maxBufferedEvents ?? Infinity;
    if (this.#queue.length > max && this.#state !== 'closed') {
      this.#queue.push({
        type: 'error',
        receivedAt: this._now(),
        fatal: true,
        error: this._error('SOCKET_BUFFER_OVERFLOW', {
          feed: this.feed,
          maxBufferedEvents: max,
        }),
      });
      void this.close(4008, 'event buffer overflow');
    }
  }

  /** `{ receivedAt, raw? }` for an event parsed from `text`. */
  protected _base(receivedAt: number, text: string): FeedEventBase {
    return this._options.includeRaw ? { receivedAt, raw: text } : {
      receivedAt,
    };
  }

  /** The configured clock. */
  protected _now(): number {
    return (this._options.clock ?? Date.now)();
  }

  /** Whether a connection is open right now. */
  protected get _isOpen(): boolean {
    return this.#state === 'open';
  }

  /**
   * Queue one frame for the open connection, paced by
   * {@link _sendIntervalMs}. Returns `false` (and sends nothing) while
   * disconnected — subscriptions are replayed by {@link _onOpen} on the
   * next connection, so nothing is lost.
   */
  protected _send(text: string): boolean {
    if (!this._isOpen || !this.#ws) return false;
    this.#outbox.push(text);
    this.#flush();
    return true;
  }

  /** Restart the data watchdog — call when a new subscription is sent. */
  protected _touchData(): void {
    this.#lastDataAt = this._now();
  }

  /**
   * Track a contiguous sequence on `stream`. `first`..`last` is the span
   * this message covers (equal for a plain sequence number). Emits a `gap`
   * when `first` isn't one past the previous `last`.
   */
  protected _sequence(
    stream: string,
    first: number,
    last: number,
    base: FeedEventBase,
  ): void {
    const previous = this.#sequences.get(stream);
    if (previous !== undefined && first !== previous + 1) {
      this._emit({
        ...base,
        type: 'gap',
        stream,
        expected: previous + 1,
        received: first,
      });
    }
    this.#sequences.set(stream, last);
  }

  /** Forget a sequence (unsubscribed, or re-snapshotted by the venue). */
  protected _forgetSequence(stream: string): void {
    this.#sequences.delete(stream);
  }

  /**
   * Forget every sequence. Sequences survive reconnects by default, so a
   * venue whose ids are global (exchange trade ids, book update ids)
   * reports the jump across the outage as a `gap`; a venue whose sequence
   * restarts per connection calls this from {@link _onSessionEnd}.
   */
  protected _clearSequences(): void {
    this.#sequences.clear();
  }

  /**
   * Validate one venue message. On failure an `invalid` event carrying the
   * message and the reason is emitted (nothing is dropped silently) and
   * `undefined` is returned.
   */
  protected _parse<D>(
    schema: BaseGuardian<D>,
    data: unknown,
    venueType: string,
    base: FeedEventBase,
  ): D | undefined {
    const [error, value] = schema.safeParse(data);
    if (!error) return value as D;
    this._emit({
      ...base,
      type: 'invalid',
      venueType,
      data,
      error: this._error('SOCKET_INVALID_MESSAGE', {
        feed: this.feed,
        venueType,
        issues: (error as GuardianError).toJSON?.() ?? error.message,
      }, error),
    });
    return undefined;
  }

  /** Emit a non-fatal error event. */
  protected _emitError(error: E, receivedAt: number = this._now()): void {
    this._emit({ type: 'error', receivedAt, error, fatal: false });
  }

  /**
   * Stop for good with `error` (e.g. the venue refused the credentials):
   * the connection closes, a `disconnected` and a fatal `error` event
   * follow, and no reconnect is attempted.
   */
  protected _fail(error: E): void {
    if (this.#closed() || this.#pendingFatal) return;
    this.#pendingFatal = error;
    this.#endCurrent?.({ code: 4000, reason: error.message });
    this.#wake?.();
  }

  /**
   * Drop the current connection and reconnect through the normal backoff
   * (e.g. the venue asked clients to move off a draining server).
   */
  protected _reconnect(reason: string): void {
    this.#endCurrent?.({ code: 4000, reason });
  }

  // ── Internals ────────────────────────────────────────────────────────────

  async #loop(): Promise<void> {
    const policy = this._options.reconnect === false
      ? false
      : { ...DEFAULT_RECONNECT, ...this._options.reconnect };
    while (!this.#closed()) {
      let url: string;
      let headers: Record<string, string> | undefined;
      try {
        url = this._url();
        headers = await this._headers();
      } catch (cause) {
        this.#fatal(this.#handlerError(cause, 'building the connection'));
        return;
      }
      if (this.#closed()) return;

      let ws: WebSocket;
      try {
        ws = this.#open(url, headers);
      } catch (cause) {
        this.#fatal(
          this._error('SOCKET_UNSUPPORTED_RUNTIME', {
            feed: this.feed,
            detail: cause instanceof Error ? cause.message : String(cause),
          }, cause instanceof Error ? cause : undefined),
        );
        return;
      }

      const started = this._now();
      const end = await this.#runSession(ws, url);
      if (this.#closed()) {
        if (end.opened) this.#emitDisconnected(end, undefined);
        return;
      }

      const fatal = this.#pendingFatal ??
        (end.opened
          ? this._fatalClose(end.code, end.reason)
          : await this._diagnoseConnectFailure(url));
      if (fatal) {
        this.#emitDisconnected(end, undefined);
        this.#fatal(fatal);
        return;
      }

      if (
        policy && end.opened && this._now() - started >= policy.healthyAfterMs
      ) {
        this.#attempt = 0;
      }
      this.#attempt += 1;
      if (!policy || this.#attempt > policy.maxAttempts) {
        this.#emitDisconnected(end, undefined);
        this.#fatal(
          this._error('SOCKET_RECONNECT_EXHAUSTED', {
            feed: this.feed,
            attempts: this.#attempt - 1,
            reason: end.reason,
          }),
        );
        return;
      }

      const exp = Math.min(
        policy.maxDelayMs,
        policy.initialDelayMs * 2 ** (this.#attempt - 1),
      );
      const delay = Math.round(exp / 2 + Math.random() * (exp / 2));
      this.#state = 'reconnecting';
      this.#emitDisconnected(end, delay);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        this.#wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.#wake = undefined;
    }
  }

  /** Read through a method so TypeScript doesn't narrow it across awaits. */
  #closed(): boolean {
    return this.#state === 'closed';
  }

  #open(url: string, headers: Record<string, string> | undefined): WebSocket {
    if (this._options.webSocket) {
      return this._options.webSocket(url, { headers });
    }
    const Ctor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    if (typeof Ctor !== 'function') {
      throw new Error('no global WebSocket in this runtime');
    }
    if (!headers) return new Ctor(url);
    // Deno, Bun and Node (undici) accept `{ headers }` as the second
    // argument; the DOM typing only knows `protocols`.
    return new (Ctor as unknown as new (
      url: string,
      init: { headers: Record<string, string> },
    ) => WebSocket)(url, { headers });
  }

  #runSession(ws: WebSocket, url: string): Promise<SessionEnd> {
    const session = ++this.#session;
    const opts = this._options;
    return new Promise<SessionEnd>((resolve) => {
      let opened = false;
      let ended = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let watchdog: ReturnType<typeof setInterval> | undefined;
      const connectTimer = setTimeout(() => {
        finish({ opened: false, reason: 'connect timeout' }, 4000);
      }, opts.connectTimeoutMs ?? 15_000);

      /** End this session once; `closeCode` also closes the socket. */
      const finish = (end: SessionEnd, closeCode?: number): void => {
        if (ended) return;
        ended = true;
        clearTimeout(connectTimer);
        if (heartbeat) clearInterval(heartbeat);
        if (watchdog) clearInterval(watchdog);
        if (closeCode !== undefined) {
          try {
            ws.close(closeCode, end.reason.slice(0, 120));
          } catch {
            // Never opened, or already closing.
          }
        }
        if (this.#session === session) this.#endSession();
        resolve(end);
      };
      this.#endCurrent = ({ code, reason }) =>
        finish({ opened, code, reason }, code);

      ws.binaryType = 'arraybuffer';
      ws.addEventListener('open', () => {
        if (ended) return;
        opened = true;
        clearTimeout(connectTimer);
        this.#ws = ws;
        this.#state = 'open';
        this.#connections += 1;
        const now = this._now();
        this.#lastFrameAt = now;
        this.#lastDataAt = now;
        const first = this.#connections === 1;
        this._emit({
          type: 'connected',
          receivedAt: now,
          url,
          connection: this.#connections,
          reconnected: !first,
        });
        if (first) this.#firstOpen?.resolve();

        const beat = opts.heartbeatIntervalMs ?? 0;
        if (beat > 0) {
          heartbeat = setInterval(() => {
            if (this.#session === session && this._isOpen) this._heartbeat();
          }, beat);
        }
        const idle = opts.idleTimeoutMs ?? 0;
        const data = opts.dataTimeoutMs ?? 0;
        if (idle > 0 || data > 0) {
          const tick = Math.max(
            10,
            Math.min(1_000, Math.min(...[idle, data].filter((v) => v > 0)) / 4),
          );
          watchdog = setInterval(() => {
            const t = this._now();
            if (idle > 0 && t - this.#lastFrameAt >= idle) {
              finish({ opened: true, reason: `no frame for ${idle}ms` }, 4000);
            } else if (
              data > 0 && this._hasSubscriptions() &&
              t - this.#lastDataAt >= data
            ) {
              finish(
                { opened: true, reason: `no data frame for ${data}ms` },
                4000,
              );
            }
          }, tick);
        }

        Promise.resolve()
          .then(() => this._onOpen())
          .catch((cause) =>
            this._emitError(this.#handlerError(cause, 'opening the session'))
          );
      });

      ws.addEventListener('message', (event: MessageEvent) => {
        if (ended) return;
        const receivedAt = this._now();
        this.#lastFrameAt = receivedAt;
        const payload = event.data;
        const text = typeof payload === 'string'
          ? payload
          : payload instanceof ArrayBuffer
          ? decoder.decode(payload)
          : ArrayBuffer.isView(payload)
          ? decoder.decode(payload)
          : String(payload);
        let isData: boolean | void = true;
        try {
          isData = this._onText(text, receivedAt);
        } catch (cause) {
          this._emitError(
            this.#handlerError(cause, 'handling a frame'),
            receivedAt,
          );
        }
        if (isData !== false) this.#lastDataAt = receivedAt;
      });

      ws.addEventListener('close', (event: CloseEvent) => {
        finish({
          opened,
          code: event.code,
          reason: event.reason ||
            (opened ? 'closed by peer' : 'connect failed'),
        });
      });

      ws.addEventListener('error', (event: Event) => {
        const message = (event as { message?: unknown }).message;
        finish({
          opened,
          reason: typeof message === 'string' && message
            ? message
            : opened
            ? 'socket error'
            : 'connect failed',
        }, 4000);
      });
    });
  }

  /** Ends the live session (open or still handshaking) from outside it. */
  #endCurrent?: (end: { code: number; reason: string }) => void;

  #endSession(): void {
    this.#endCurrent = undefined;
    this.#ws = undefined;
    this.#outbox = [];
    if (this.#outboxTimer) clearTimeout(this.#outboxTimer);
    this.#outboxTimer = undefined;
    if (this.#state === 'open') this.#state = 'connecting';
    try {
      this._onSessionEnd();
    } catch (cause) {
      this._emitError(this.#handlerError(cause, 'ending the session'));
    }
  }

  #flush(): void {
    if (this.#outboxTimer) return;
    const ws = this.#ws;
    if (!ws) return;
    const wait = this.#lastSendAt + this._sendIntervalMs - this._now();
    if (wait > 0) {
      this.#outboxTimer = setTimeout(() => {
        this.#outboxTimer = undefined;
        this.#flush();
      }, wait);
      return;
    }
    const next = this.#outbox.shift();
    if (next === undefined) return;
    try {
      ws.send(next);
    } catch (cause) {
      this._emitError(this.#handlerError(cause, 'sending a frame'));
    }
    this.#lastSendAt = this._now();
    if (this.#outbox.length > 0) {
      if (this._sendIntervalMs <= 0) this.#flush();
      else {
        this.#outboxTimer = setTimeout(() => {
          this.#outboxTimer = undefined;
          this.#flush();
        }, this._sendIntervalMs);
      }
    }
  }

  #emitDisconnected(end: SessionEnd, reconnectInMs: number | undefined): void {
    this._emit({
      type: 'disconnected',
      receivedAt: this._now(),
      ...(end.code !== undefined && { code: end.code }),
      reason: end.reason,
      attempt: this.#attempt,
      ...(reconnectInMs !== undefined && { reconnectInMs }),
    });
  }

  #fatal(error: E): void {
    this._emit({ type: 'error', receivedAt: this._now(), error, fatal: true });
    this.#state = 'closed';
    this.#finish(error);
  }

  #finish(error: E): void {
    if (this.#finished) return;
    this.#firstOpen?.reject(error);
    this.#firstOpen = undefined;
    this.#finished = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  #handlerError(cause: unknown, during: string): E {
    return this._error('SOCKET_HANDLER_ERROR', {
      feed: this.feed,
      during,
      detail: cause instanceof Error ? cause.message : String(cause),
    }, cause instanceof Error ? cause : undefined);
  }
}
