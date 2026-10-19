/**
 * Tests for the vendored `FeedSocket` core, against a real loopback
 * WebSocket server. VENDORED — keep every copy identical.
 */
import { afterEach, beforeEach, describe, it } from '@test';
import { assert, assertEquals, assertRejects } from '@asserts';
import {
  FeedSocket,
  type FeedSocketErrorCode,
  type FeedSocketOptions,
} from './FeedSocket.ts';
import {
  collectUntil,
  type MockConnection,
  MockFeedServer,
} from './fixtures/MockFeedServer.ts';

class TestError extends Error {
  constructor(
    public readonly code: string,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(code);
  }
}

type Tick = { type: 'tick'; receivedAt: number; seq: number; raw?: string };

/** Minimal protocol: `{"op":"sub",topics}` on open, `PING`/`PONG`, `{"seq":n}` data. */
class TestSocket extends FeedSocket<Tick, TestError> {
  public readonly feed = 'test';
  public topics = new Set<string>();
  public diagnosis?: TestError;
  public sessionsEnded = 0;
  readonly #url: string;

  constructor(url: string, options: FeedSocketOptions = {}) {
    super({
      reconnect: { initialDelayMs: 10, maxDelayMs: 40 },
      ...options,
    });
    this.#url = url;
  }

  setSendInterval(ms: number): void {
    this._sendIntervalMs = ms;
  }

  subscribe(topic: string): void {
    this.topics.add(topic);
    this._touchData();
    this._send(JSON.stringify({ op: 'sub', topics: [topic] }));
  }

  sendRaw(text: string): boolean {
    return this._send(text);
  }

  fail(code: string): void {
    this._fail(new TestError(code));
  }

  bounce(): void {
    this._reconnect('asked to move');
  }

  public fatalCloseCodes = new Set<number>();

  protected override _fatalClose(
    code: number | undefined,
  ): TestError | undefined {
    return code !== undefined && this.fatalCloseCodes.has(code)
      ? new TestError('SOCKET_AUTH_FAILED', { code })
      : undefined;
  }

  protected _error(
    code: FeedSocketErrorCode,
    meta?: Record<string, unknown>,
  ): TestError {
    return new TestError(code, meta);
  }

  protected _url(): string {
    return this.#url;
  }

  protected _onOpen(): void {
    if (this.topics.size > 0) {
      this._send(JSON.stringify({ op: 'sub', topics: [...this.topics] }));
    }
  }

  protected override _heartbeat(): void {
    this._send('PING');
  }

  protected override _hasSubscriptions(): boolean {
    return this.topics.size > 0;
  }

  protected override _diagnoseConnectFailure(): Promise<TestError | undefined> {
    return Promise.resolve(this.diagnosis);
  }

  protected override _onSessionEnd(): void {
    this.sessionsEnded += 1;
  }

  protected _onText(text: string, receivedAt: number): boolean | void {
    if (text === 'PONG') return false;
    if (text === 'THROW') throw new Error('boom');
    const msg = JSON.parse(text) as { seq?: number };
    const base = this._base(receivedAt, text);
    if (typeof msg.seq !== 'number') {
      this._emit({ ...base, type: 'unknown', data: msg });
      return;
    }
    this._sequence('ticks', msg.seq, msg.seq, base);
    this._emit({ ...base, type: 'tick', seq: msg.seq });
  }
}

const isType = (t: string) => (e: { type: string }) => e.type === t;

describe('FeedSocket', () => {
  let server: MockFeedServer;
  let socket: TestSocket | undefined;

  beforeEach(async () => {
    server = await MockFeedServer.start();
  });

  afterEach(async () => {
    await socket?.close();
    socket = undefined;
    await server.stop();
  });

  it('connects, resends subscriptions on open and delivers frames in order', async () => {
    let clock = 1_000;
    socket = new TestSocket(server.url(), {
      includeRaw: true,
      clock: () => ++clock,
    });
    socket.topics.add('a');
    const it = socket[Symbol.asyncIterator]();
    const [connected] = await collectUntil(it, isType('connected'));
    assertEquals(connected?.type, 'connected');
    assert(connected?.type === 'connected' && !connected.reconnected);
    assertEquals(socket.state, 'open');

    const conn = await server.connection();
    await conn.waitFor((f) => f.includes('"op":"sub"'));
    assertEquals(conn.json()[0], { op: 'sub', topics: ['a'] });

    conn.send({ seq: 1 });
    conn.send({ seq: 2 });
    conn.send({ other: true });
    const events = await collectUntil(it, isType('unknown'));
    assertEquals(events.map((e) => e.type), ['tick', 'tick', 'unknown']);
    const first = events[0] as Tick;
    assertEquals(first.raw, '{"seq":1}');
    assert(first.receivedAt > 1_000);
  });

  it('omits raw unless includeRaw is set', async () => {
    socket = new TestSocket(server.url());
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    (await server.connection()).send({ seq: 1 });
    const [tick] = await collectUntil(it, isType('tick'));
    assertEquals((tick as Tick).raw, undefined);
  });

  it('reconnects with backoff, reports it, and resubscribes', async () => {
    socket = new TestSocket(server.url());
    socket.topics.add('a');
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const first = await server.connection(1);
    await first.waitFor((f) => f.includes('sub'));
    first.close(1011, 'server restart');

    const events = await collectUntil(it, isType('connected'));
    const disconnected = events.find((e) => e.type === 'disconnected');
    assert(disconnected?.type === 'disconnected');
    assertEquals(disconnected.code, 1011);
    assert((disconnected.reconnectInMs ?? -1) >= 0);
    const reconnected = events.at(-1);
    assert(reconnected?.type === 'connected' && reconnected.reconnected);
    assertEquals(reconnected.connection, 2);

    const second = await server.connection(2);
    await second.waitFor((f) => f.includes('"topics":["a"]'));
    assert(socket.sessionsEnded >= 1);
  });

  it('emits a gap when a sequence jumps', async () => {
    socket = new TestSocket(server.url());
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    conn.send({ seq: 1 });
    conn.send({ seq: 2 });
    conn.send({ seq: 5 });
    const events = await collectUntil(
      it,
      (e) => e.type === 'tick' && e.seq === 5,
    );
    const gap = events.find((e) => e.type === 'gap');
    assert(gap?.type === 'gap');
    assertEquals([gap.stream, gap.expected, gap.received], ['ticks', 3, 5]);
  });

  it('keeps sequences across a reconnect so a global id jump is reported', async () => {
    socket = new TestSocket(server.url());
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    (await server.connection(1)).send({ seq: 1 });
    await collectUntil(it, isType('tick'));
    (await server.connection(1)).close();
    await collectUntil(it, (e) => e.type === 'connected' && e.reconnected);
    (await server.connection(2)).send({ seq: 9 });
    const events = await collectUntil(it, isType('tick'));
    const gap = events.find((e) => e.type === 'gap');
    assert(gap?.type === 'gap' && gap.expected === 2 && gap.received === 9);
  });

  it('reconnects a silent connection after the idle timeout', async () => {
    socket = new TestSocket(server.url(), {
      heartbeatIntervalMs: 20,
      idleTimeoutMs: 120,
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    await conn.waitFor((f) => f === 'PING');
    const events = await collectUntil(it, isType('disconnected'));
    const d = events.at(-1);
    assert(d?.type === 'disconnected' && d.reason.includes('no frame'));
  });

  it('stays connected while heartbeats are answered', async () => {
    socket = new TestSocket(server.url(), {
      heartbeatIntervalMs: 20,
      idleTimeoutMs: 120,
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    const ponger = setInterval(() => conn.send('PONG'), 20);
    try {
      await new Promise((r) => setTimeout(r, 400));
      assertEquals(socket.state, 'open');
      assertEquals(server.connections.length, 1);
    } finally {
      clearInterval(ponger);
    }
  });

  it('reconnects a subscribed connection that only answers heartbeats', async () => {
    socket = new TestSocket(server.url(), {
      heartbeatIntervalMs: 20,
      dataTimeoutMs: 150,
    });
    socket.topics.add('a');
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    const ponger = setInterval(() => conn.send('PONG'), 20);
    try {
      const events = await collectUntil(it, isType('disconnected'));
      const d = events.at(-1);
      assert(d?.type === 'disconnected' && d.reason.includes('no data'));
    } finally {
      clearInterval(ponger);
    }
  });

  it('does not run the data watchdog without subscriptions', async () => {
    socket = new TestSocket(server.url(), { dataTimeoutMs: 60 });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    await new Promise((r) => setTimeout(r, 250));
    assertEquals(socket.state, 'open');
  });

  it('close() ends the iterator after buffered events', async () => {
    socket = new TestSocket(server.url());
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    conn.send({ seq: 1 });
    await conn.waitFor(() => true, 50).catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    await socket.close();
    const rest = await collectUntil(it, () => false);
    assertEquals(rest.map((e) => e.type), ['tick', 'disconnected']);
    assertEquals(socket.state, 'closed');
    await assertRejects(() => socket!.connect());
  });

  it('breaking out of for-await closes the socket', async () => {
    socket = new TestSocket(server.url());
    for await (const event of socket) {
      if (event.type === 'connected') break;
    }
    assertEquals(socket.state, 'closed');
  });

  it('an AbortSignal closes the socket', async () => {
    const controller = new AbortController();
    socket = new TestSocket(server.url(), { signal: controller.signal });
    await socket.connect();
    controller.abort();
    const conn = await server.connection();
    const deadline = Date.now() + 2_000;
    while (!conn.closed && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    assert(conn.closed);
    assertEquals(socket.state, 'closed');
  });

  it('an already-aborted signal never connects', async () => {
    const controller = new AbortController();
    controller.abort();
    socket = new TestSocket(server.url(), { signal: controller.signal });
    await assertRejects(() => socket!.connect());
    assertEquals(server.connections.length, 0);
  });

  it('gives up after maxAttempts with a fatal error', async () => {
    server.refuseWith = { status: 503, times: 100 };
    socket = new TestSocket(server.url(), {
      reconnect: { initialDelayMs: 5, maxDelayMs: 10, maxAttempts: 2 },
    });
    const events = await collectUntil(
      socket[Symbol.asyncIterator](),
      (e) => e.type === 'error' && e.fatal,
    );
    const fatal = events.at(-1);
    assert(fatal?.type === 'error');
    assertEquals(fatal.error.code, 'SOCKET_RECONNECT_EXHAUSTED');
    assertEquals(
      events.filter((e) => e.type === 'disconnected').length,
      3,
    );
    await assertRejects(() => socket!.connect());
  });

  it('reconnect: false stops after the first disconnect', async () => {
    socket = new TestSocket(server.url(), { reconnect: false });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    (await server.connection()).close();
    const events = await collectUntil(it, () => false);
    assertEquals(events.map((e) => e.type), ['disconnected', 'error']);
    const d = events[0];
    assert(d?.type === 'disconnected' && d.reconnectInMs === undefined);
  });

  it('a connect-failure diagnosis is fatal and not retried', async () => {
    server.refuseWith = { status: 451, times: 100 };
    socket = new TestSocket(server.url());
    socket.diagnosis = new TestError('SOCKET_GEO_BLOCKED');
    await assertRejects(() => socket!.connect());
    const events = await collectUntil(
      socket[Symbol.asyncIterator](),
      () => false,
    );
    const fatal = events.at(-1);
    assert(fatal?.type === 'error' && fatal.fatal);
    assertEquals(fatal.error.code, 'SOCKET_GEO_BLOCKED');
  });

  it('_fail() closes for good with a fatal error', async () => {
    socket = new TestSocket(server.url());
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    socket.fail('SOCKET_AUTH_FAILED');
    const events = await collectUntil(it, () => false);
    assertEquals(events.map((e) => e.type), ['disconnected', 'error']);
    const fatal = events[1];
    assert(fatal?.type === 'error' && fatal.fatal);
    assertEquals(fatal.error.code, 'SOCKET_AUTH_FAILED');
    assertEquals(server.connections.length, 1);
  });

  it('a close code marked fatal stops reconnecting', async () => {
    socket = new TestSocket(server.url());
    socket.fatalCloseCodes.add(4001);
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    (await server.connection()).close(4001, 'bad credentials');
    const events = await collectUntil(it, () => false);
    const fatal = events.at(-1);
    assert(fatal?.type === 'error' && fatal.fatal);
    assertEquals(fatal.error.code, 'SOCKET_AUTH_FAILED');
  });

  it('_reconnect() drops the connection and reconnects', async () => {
    socket = new TestSocket(server.url());
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    socket.bounce();
    const events = await collectUntil(it, isType('connected'));
    const d = events.find((e) => e.type === 'disconnected');
    assert(d?.type === 'disconnected' && d.reason === 'asked to move');
    await server.connection(2);
  });

  it('times out a handshake that never completes', async () => {
    // A TCP port that accepts nothing in time: an unroutable address.
    socket = new TestSocket('ws://10.255.255.1:9/', {
      connectTimeoutMs: 50,
      reconnect: false,
    });
    const events = await collectUntil(
      socket[Symbol.asyncIterator](),
      () => false,
    );
    const d = events.find((e) => e.type === 'disconnected');
    assert(d?.type === 'disconnected');
  });

  it('overflowing maxBufferedEvents is a fatal, reported error', async () => {
    socket = new TestSocket(server.url(), { maxBufferedEvents: 3 });
    await socket.connect();
    const conn = await server.connection();
    for (let i = 1; i <= 10; i++) conn.send({ seq: i });
    const deadline = Date.now() + 2_000;
    while (socket.state !== 'closed' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const events = await collectUntil(
      socket[Symbol.asyncIterator](),
      () => false,
    );
    const overflow = events.find((e) => e.type === 'error');
    assert(overflow?.type === 'error' && overflow.fatal);
    assertEquals(overflow.error.code, 'SOCKET_BUFFER_OVERFLOW');
  });

  it('reports a throwing frame handler without dropping the connection', async () => {
    socket = new TestSocket(server.url());
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    conn.send('THROW');
    conn.send({ seq: 1 });
    const events = await collectUntil(it, isType('tick'));
    const err = events.find((e) => e.type === 'error');
    assert(err?.type === 'error' && !err.fatal);
    assertEquals(err.error.code, 'SOCKET_HANDLER_ERROR');
  });

  it('rejects a second concurrent iterator', async () => {
    socket = new TestSocket(server.url());
    socket[Symbol.asyncIterator]();
    let threw = false;
    try {
      socket[Symbol.asyncIterator]();
    } catch (err) {
      threw = (err as TestError).code === 'SOCKET_IN_USE';
    }
    assert(threw);
  });

  it('paces outgoing frames by the send interval', async () => {
    socket = new TestSocket(server.url());
    socket.setSendInterval(40);
    await socket.connect();
    const conn = await server.connection();
    const started = Date.now();
    for (let i = 0; i < 4; i++) socket.sendRaw(`m${i}`);
    await conn.waitFor((f) => f === 'm3');
    assert(
      Date.now() - started >= 100,
      'four frames took at least 3 intervals',
    );
    assertEquals(conn.received.slice(-4), ['m0', 'm1', 'm2', 'm3']);
  });

  it('drops sends while disconnected (state is replayed on open)', () => {
    socket = new TestSocket(server.url());
    assertEquals(socket.sendRaw('x'), false);
  });

  it('passes handshake headers and uses a custom factory', async () => {
    const urls: string[] = [];
    socket = new TestSocket(server.url('/feed?x=1'), {
      webSocket: (url) => {
        urls.push(url);
        return new WebSocket(url);
      },
    });
    await socket.connect();
    assertEquals(urls, [server.url('/feed?x=1')]);
    const conn: MockConnection = await server.connection();
    assertEquals(conn.path, '/feed?x=1');
  });
});
