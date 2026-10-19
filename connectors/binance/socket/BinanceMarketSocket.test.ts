import { afterEach, beforeEach, describe, it } from '@test';
import { assert, assertEquals } from '@asserts';
import {
  BinanceMarketSocket,
  type BinanceMarketSocketEvent,
} from './BinanceMarketSocket.ts';
import { collectUntil, MockFeedServer } from './fixtures/MockFeedServer.ts';
import { envArgs } from '@utils';

const trade = (t: number, symbol = 'BTCUSDT') => ({
  stream: `${symbol.toLowerCase()}@trade`,
  data: {
    e: 'trade',
    E: 1792414402540,
    s: symbol,
    t,
    p: '82568.01000000',
    q: '0.01210000',
    T: 1792414402540,
    m: false,
    M: true,
  },
});
const depth = (U: number, u: number) => ({
  stream: 'btcusdt@depth@100ms',
  data: {
    e: 'depthUpdate',
    E: 1792414402514,
    s: 'BTCUSDT',
    U,
    u,
    b: [['82568.00000000', '0.42853000'], ['82558.72000000', '0.00000000']],
    a: [],
  },
});

const isType = (t: string) => (e: BinanceMarketSocketEvent) => e.type === t;

describe('BinanceMarketSocket', () => {
  let server: MockFeedServer;
  let socket: BinanceMarketSocket | undefined;

  beforeEach(async () => {
    server = await MockFeedServer.start();
  });
  afterEach(async () => {
    await socket?.close();
    socket = undefined;
    await server.stop();
  });

  it('defaults to the market-data-only host and honours host/timeUnit', () => {
    const url = (o: ConstructorParameters<typeof BinanceMarketSocket>[0]) =>
      (new BinanceMarketSocket(o) as unknown as { _url(): string })._url();
    assertEquals(url({}), 'wss://data-stream.binance.vision/stream');
    assertEquals(
      url({ host: 'stream', timeUnit: 'MICROSECOND' }),
      'wss://stream.binance.com:9443/stream?timeUnit=MICROSECOND',
    );
  });

  it('subscribes every stream kind with normalised symbols, and resubscribes on reconnect', async () => {
    socket = new BinanceMarketSocket({
      url: server.url('/stream'),
      streams: {
        trade: ['BTCUSDT', 'eth-usdt'],
        bookTicker: ['SOL_USDT'],
        depth: ['XRPUSDT'],
      },
      reconnect: { initialDelayMs: 5, maxDelayMs: 10 },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const first = await server.connection(1);
    await first.waitFor((f) => f.includes('SUBSCRIBE'));
    assertEquals(first.json()[0], {
      method: 'SUBSCRIBE',
      params: [
        'btcusdt@trade',
        'ethusdt@trade',
        'solusdt@bookTicker',
        'xrpusdt@depth@100ms',
      ],
      id: 1,
    });
    first.close(1000, '24h limit');
    await collectUntil(it, (e) => e.type === 'connected' && e.reconnected);
    const second = await server.connection(2);
    await second.waitFor((f) => f.includes('SUBSCRIBE'));
  });

  it('paces subscribe frames under the 5 messages/second limit', async () => {
    socket = new BinanceMarketSocket({ url: server.url('/stream') });
    await socket.connect();
    const conn = await server.connection();
    const started = Date.now();
    socket.subscribe('trade', ['BTCUSDT']);
    socket.subscribe('bookTicker', ['BTCUSDT']);
    socket.unsubscribe('trade', ['BTCUSDT']);
    await conn.waitFor((f) => f.includes('UNSUBSCRIBE'));
    assert(Date.now() - started >= 450, 'three frames span two 250ms gaps');
    assertEquals(socket.streams, ['btcusdt@bookTicker']);
  });

  it('parses trades, book tickers and depth diffs', async () => {
    socket = new BinanceMarketSocket({
      url: server.url('/stream'),
      includeRaw: true,
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    conn.send(trade(1));
    conn.send({
      stream: 'btcusdt@bookTicker',
      data: {
        u: 101631018582,
        s: 'BTCUSDT',
        b: '82568.00000000',
        B: '0.42853000',
        a: '82568.01000000',
        A: '8.09289000',
      },
    });
    conn.send(depth(10, 20));
    const events = await collectUntil(it, isType('depthUpdate'));
    assertEquals(events.map((e) => e.type), [
      'trade',
      'bookTicker',
      'depthUpdate',
    ]);
    const [t, top, d] = events;
    assert(t?.type === 'trade');
    assertEquals(t.stream, 'btcusdt@trade');
    assertEquals(
      [t.data.tradeId, t.data.price, t.data.quantity, t.data.buyerIsMaker],
      [1, 82568.01, 0.0121, false],
    );
    assertEquals(t.venueTimestamp, 1792414402540);
    assertEquals((t.data as Record<string, unknown>).M, true);
    assert(t.raw?.includes('"82568.01000000"'));
    assert(top?.type === 'bookTicker');
    assertEquals([top.data.bidPrice, top.data.askQuantity], [82568, 8.09289]);
    assertEquals(top.venueTimestamp, undefined);
    assert(d?.type === 'depthUpdate');
    assertEquals(d.data.bids[1], { price: 82558.72, quantity: 0 });
  });

  it('reports trade-id and depth update-id gaps, also across a reconnect', async () => {
    socket = new BinanceMarketSocket({
      url: server.url('/stream'),
      reconnect: { initialDelayMs: 5, maxDelayMs: 10 },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const first = await server.connection(1);
    first.send(trade(100));
    first.send(trade(101));
    first.send(trade(105));
    first.send(depth(10, 20));
    first.send(depth(21, 30));
    first.send(depth(35, 40));
    const events = await collectUntil(
      it,
      (e) => e.type === 'depthUpdate' && e.data.firstUpdateId === 35,
    );
    const gaps = events.filter((e) => e.type === 'gap');
    assertEquals(
      gaps.map((g) => g.type === 'gap' && [g.stream, g.expected, g.received]),
      [['btcusdt@trade', 102, 105], ['btcusdt@depth@100ms', 31, 35]],
    );

    first.close();
    await collectUntil(it, (e) => e.type === 'connected' && e.reconnected);
    (await server.connection(2)).send(trade(110));
    const after = await collectUntil(it, isType('trade'));
    const gap = after.find((e) => e.type === 'gap');
    assert(gap?.type === 'gap' && gap.expected === 106 && gap.received === 110);
  });

  it('reports venue error replies and ignores acks', async () => {
    socket = new BinanceMarketSocket({ url: server.url('/stream') });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    conn.send({ result: null, id: 1 });
    conn.send({ error: { code: 2, msg: 'Invalid request' }, id: 2 });
    const events = await collectUntil(it, isType('error'));
    assertEquals(events.length, 1);
    const err = events[0];
    assert(err?.type === 'error' && !err.fatal);
    assertEquals(err.error.getContextValue('venueCode'), 2);
  });

  it('probes liveness with LIST_SUBSCRIPTIONS', async () => {
    socket = new BinanceMarketSocket({
      url: server.url('/stream'),
      heartbeatIntervalMs: 20,
      idleTimeoutMs: 150,
      reconnect: { initialDelayMs: 5, maxDelayMs: 10 },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    await conn.waitFor((f) => f.includes('LIST_SUBSCRIPTIONS'));
    await collectUntil(it, (e) => e.type === 'connected' && e.reconnected);
  });

  it('treats a geo-block (HTTP 451) as fatal instead of reconnecting', async () => {
    server.refuseWith = { status: 451, times: 100 };
    socket = new BinanceMarketSocket({ url: server.url('/stream') });
    const events = await collectUntil(
      socket[Symbol.asyncIterator](),
      () => false,
    );
    const fatal = events.at(-1);
    assert(fatal?.type === 'error' && fatal.fatal);
    assertEquals(fatal.error.code, 'SOCKET_GEO_BLOCKED');
    assertEquals(fatal.error.getContextValue('status'), 451);
    assertEquals(server.connections.length, 0);
  });

  it('retries a refused handshake that is not a geo-block', async () => {
    server.refuseWith = { status: 503, times: 1 };
    socket = new BinanceMarketSocket({
      url: server.url('/stream'),
      reconnect: { initialDelayMs: 5, maxDelayMs: 10 },
    });
    const events = await collectUntil(
      socket[Symbol.asyncIterator](),
      isType('connected'),
    );
    assertEquals(events.map((e) => e.type), ['disconnected', 'connected']);
  });
});

// ── Live ─────────────────────────────────────────────────────────────────────
// Public streams need no credentials; opt in with LIVE_TEST_SOCKETS (set by
// the monthly live-tests workflow).

const liveEnv = envArgs();
const liveSockets = !!liveEnv.get('LIVE_TEST_SOCKETS');

describe({
  name: 'BinanceMarketSocket — live',
  ignore: !liveSockets,
  bun: false,
  node: false,
  fn: () => {
    it('streams trades, book tickers and depth for the majors', async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
      const socket = new BinanceMarketSocket({
        streams: { trade: symbols, bookTicker: symbols, depth: ['BTCUSDT'] },
        signal: AbortSignal.timeout(20_000),
      });
      const seen = new Set<string>();
      for await (const event of socket) {
        if (event.type === 'invalid') throw event.error;
        if (event.type === 'error' && event.fatal) throw event.error;
        seen.add(event.type);
        if (
          seen.has('trade') && seen.has('bookTicker') && seen.has('depthUpdate')
        ) {
          break;
        }
      }
      assert(
        seen.has('trade') && seen.has('bookTicker') && seen.has('depthUpdate'),
        `saw ${[...seen]}`,
      );
    });
  },
});
