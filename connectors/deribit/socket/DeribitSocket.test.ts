import { afterEach, beforeEach, describe, it } from '@test';
import { assert, assertEquals, assertThrows } from '@asserts';
import { envArgs } from '@utils';
import {
  deribitChannel,
  DeribitSocket,
  type DeribitSocketEvent,
} from './DeribitSocket.ts';
import {
  collectUntil,
  type MockConnection,
  MockFeedServer,
} from './fixtures/MockFeedServer.ts';
import { DeribitError } from '../errors/mod.ts';

const AUTH = {
  type: 'CUSTOM' as const,
  clientId: 'client-id',
  clientSecret: 'SECRET-MARKER',
};

const isType = (t: string) => (e: DeribitSocketEvent) => e.type === t;

type Request = { id: number; method: string; params: Record<string, unknown> };

/** Waits for the client's request for `method`, returning it parsed. */
async function request(conn: MockConnection, method: string): Promise<Request> {
  const text = await conn.waitFor((f) => f.includes(`"method":"${method}"`));
  return JSON.parse(text) as Request;
}

/** Answers the client's next `method` request with `result`. */
async function answer(
  conn: MockConnection,
  method: string,
  result: unknown,
): Promise<Request> {
  const req = await request(conn, method);
  conn.send({
    jsonrpc: '2.0',
    id: req.id,
    result,
    usIn: 1,
    usOut: 2,
    usDiff: 1,
  });
  return req;
}

const notify = (conn: MockConnection, channel: string, data: unknown) =>
  conn.send({
    jsonrpc: '2.0',
    method: 'subscription',
    params: { channel, data },
  });

const trade = (seq: number, instrument = 'BTC-PERPETUAL') => ({
  timestamp: 1794003632876,
  price: 75947.5,
  direction: 'sell',
  index_price: 75927.33,
  instrument_name: instrument,
  trade_seq: seq,
  amount: 450,
  mark_price: 75947.52,
  tick_direction: 2,
  trade_id: `t${seq}`,
});

const book = (
  type: 'snapshot' | 'change',
  changeId: number,
  prev?: number,
) => ({
  type,
  timestamp: 1794003630805,
  change_id: changeId,
  ...(prev !== undefined && { prev_change_id: prev }),
  instrument_name: 'BTC-PERPETUAL',
  bids: [['new', 75947.5, 72850.0]],
  asks: [['delete', 75950.0, 0.0]],
});

const authResult = (expiresIn = 900) => ({
  access_token: 'access',
  refresh_token: 'refresh-1',
  expires_in: expiresIn,
  scope: 'connection mainaccount read',
  token_type: 'bearer',
});

describe('DeribitSocket', () => {
  let server: MockFeedServer;
  let socket: DeribitSocket | undefined;

  beforeEach(async () => {
    server = await MockFeedServer.start();
  });
  afterEach(async () => {
    await socket?.close();
    socket = undefined;
    await server.stop();
  });

  it('names channels and picks the finest interval the connection allows', () => {
    assertEquals(
      deribitChannel({ kind: 'book', instrument: 'BTC-PERPETUAL' }, '100ms'),
      'book.BTC-PERPETUAL.100ms',
    );
    assertEquals(
      deribitChannel(
        { kind: 'trades', instrumentKind: 'option', currency: 'BTC' },
        'raw',
      ),
      'trades.option.BTC.raw',
    );
    assertEquals(
      deribitChannel({ kind: 'volatilityIndex', index: 'btc_usd' }, 'raw'),
      'deribit_volatility_index.btc_usd',
    );
    assertEquals(
      deribitChannel({ kind: 'markPrice', index: 'eth_usd' }, 'raw'),
      'markprice.options.eth_usd',
    );
    assertEquals(new DeribitSocket().interval, '100ms');
    assertEquals(new DeribitSocket({ auth: AUTH }).interval, 'raw');
    assertEquals(
      new DeribitSocket({ auth: AUTH, interval: 'agg2' }).interval,
      'agg2',
    );
    const raw = assertThrows(
      () => new DeribitSocket({ interval: 'raw' }),
      DeribitError,
    );
    assertEquals(raw.code, 'CONFIG_RAW_REQUIRES_AUTH');
    const bad = assertThrows(
      () => new DeribitSocket({ auth: { ...AUTH, clientSecret: ' ' } }),
      DeribitError,
    );
    assertEquals(bad.code, 'CONFIG_INVALID_AUTH');
    assertEquals(JSON.stringify(bad.toJSON()).includes('client-id'), false);
    assertEquals(
      assertThrows(
        () => new DeribitSocket({ heartbeatSeconds: 5 }),
        DeribitError,
      ).code,
      'CONFIG_INVALID_OPTION',
    );
  });

  it('without auth: sets the heartbeat and subscribes the 100ms channels', async () => {
    socket = new DeribitSocket({
      url: server.url('/ws/api/v2'),
      subscriptions: [
        { kind: 'book', instrument: 'BTC-PERPETUAL' },
        { kind: 'ticker', instrument: 'BTC-7NOV26-76000-C' },
        { kind: 'priceIndex', index: 'btc_usd' },
      ],
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    const hb = await answer(conn, 'public/set_heartbeat', 'ok');
    assertEquals(hb.params, { interval: 10 });
    const sub = await answer(conn, 'public/subscribe', [
      'book.BTC-PERPETUAL.100ms',
      'ticker.BTC-7NOV26-76000-C.100ms',
      'deribit_price_index.btc_usd',
    ]);
    assertEquals(sub.params.channels, [
      'book.BTC-PERPETUAL.100ms',
      'ticker.BTC-7NOV26-76000-C.100ms',
      'deribit_price_index.btc_usd',
    ]);
    const events = await collectUntil(it, isType('subscribed'));
    const subscribed = events.at(-1);
    assert(subscribed?.type === 'subscribed');
    assertEquals(subscribed.channels.length, 3);
    assertEquals(conn.received.some((f) => f.includes('public/auth')), false);
  });

  it('with auth: authenticates first, then subscribes raw channels privately', async () => {
    socket = new DeribitSocket({
      url: server.url('/ws/api/v2'),
      auth: AUTH,
      subscriptions: [{ kind: 'trades', instrument: 'BTC-PERPETUAL' }],
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    const auth = await answer(conn, 'public/auth', authResult());
    assertEquals(auth.params, {
      grant_type: 'client_credentials',
      client_id: 'client-id',
      client_secret: 'SECRET-MARKER',
    });
    const events = await collectUntil(it, isType('authenticated'));
    const ev = events.at(-1);
    assert(ev?.type === 'authenticated');
    assertEquals([ev.scope, ev.expiresIn, ev.refreshed], [
      'connection mainaccount read',
      900,
      false,
    ]);
    const sub = await request(conn, 'private/subscribe');
    assertEquals(sub.params.channels, ['trades.BTC-PERPETUAL.raw']);
    // The subscribe went out only after auth was answered.
    const order = conn.json().map((f) => (f as Request).method);
    assertEquals(
      order.indexOf('public/auth') < order.indexOf('private/subscribe'),
      true,
    );
    assertEquals(socket.hasCredentials, true);
  });

  it('treats refused credentials as fatal, without echoing the secret', async () => {
    socket = new DeribitSocket({
      url: server.url('/ws/api/v2'),
      auth: AUTH,
      reconnect: { initialDelayMs: 5, maxDelayMs: 10 },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    const req = await request(conn, 'public/auth');
    conn.send({
      jsonrpc: '2.0',
      id: req.id,
      error: { code: 13004, message: 'invalid_credentials' },
    });
    const events = await collectUntil(it, () => false);
    const fatal = events.at(-1);
    assert(fatal?.type === 'error' && fatal.fatal);
    assertEquals(fatal.error.code, 'SOCKET_AUTH_FAILED');
    assertEquals(fatal.error.getContextValue('vendorCode'), 13004);
    assertEquals(
      JSON.stringify(events).includes('SECRET-MARKER'),
      false,
    );
    assertEquals(server.connections.length, 1);
  });

  it('refreshes the token before it expires', async () => {
    socket = new DeribitSocket({ url: server.url('/'), auth: AUTH });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    await answer(conn, 'public/auth', authResult(1));
    await collectUntil(it, isType('authenticated'));
    const text = await conn.waitFor(
      (f) => f.includes('"grant_type":"refresh_token"'),
      3_000,
    );
    const refresh = JSON.parse(text) as Request;
    assertEquals(refresh.params, {
      grant_type: 'refresh_token',
      refresh_token: 'refresh-1',
    });
    conn.send({ jsonrpc: '2.0', id: refresh.id, result: authResult(900) });
    const events = await collectUntil(
      it,
      (e) => e.type === 'authenticated' && e.refreshed,
    );
    assert(events.length > 0);
  });

  it('answers test_request with public/test and counts heartbeats as control frames', async () => {
    socket = new DeribitSocket({ url: server.url('/') });
    await socket.connect();
    const conn = await server.connection();
    conn.send({
      jsonrpc: '2.0',
      method: 'heartbeat',
      params: { type: 'heartbeat' },
    });
    conn.send({
      jsonrpc: '2.0',
      method: 'heartbeat',
      params: { type: 'test_request' },
    });
    await request(conn, 'public/test');
  });

  it('chains book changes by change id and reports a jump as a gap', async () => {
    socket = new DeribitSocket({
      url: server.url('/'),
      includeRaw: true,
      subscriptions: [{ kind: 'book', instrument: 'BTC-PERPETUAL' }],
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    const ch = 'book.BTC-PERPETUAL.100ms';
    notify(conn, ch, book('snapshot', 100));
    notify(conn, ch, book('change', 110, 100));
    notify(conn, ch, book('change', 130, 120));
    const events = await collectUntil(
      it,
      (e) => e.type === 'book' && e.data.changeId === 130,
    );
    const types = events.filter((e) => e.type === 'book' || e.type === 'gap')
      .map((e) => e.type);
    assertEquals(types, ['book', 'book', 'gap', 'book']);
    const gap = events.find((e) => e.type === 'gap');
    assert(gap?.type === 'gap');
    assertEquals([gap.stream, gap.expected, gap.received], [ch, 110, 120]);
    const first = events.find((e) => e.type === 'book');
    assert(first?.type === 'book');
    assertEquals(first.channel, ch);
    assertEquals(first.venueTimestamp, 1794003630805);
    assertEquals(first.data.asks, [{
      action: 'delete',
      price: 75950,
      amount: 0,
    }]);
    assert(first.raw?.includes('"change_id":100'));
  });

  it('emits every trade of a batch, sequences per instrument, keeps big ints exact', async () => {
    socket = new DeribitSocket({
      url: server.url('/'),
      subscriptions: [{
        kind: 'trades',
        instrumentKind: 'option',
        currency: 'BTC',
      }],
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    const ch = 'trades.option.BTC.100ms';
    conn.send(
      `{"jsonrpc":"2.0","method":"subscription","params":{"channel":"${ch}","data":[` +
        `{"timestamp":1,"price":0.0003,"direction":"buy","index_price":75799.2,"instrument_name":"BTC-7NOV26-76500-C","trade_seq":122,"amount":0.1,"mark_price":3.1367e-4,"tick_direction":1,"iv":19.88,"starbase_match_id":244571814334836736,"trade_id":"1","starbase_timestamp":1794000064462549818},` +
        `{"timestamp":2,"price":0.0013,"direction":"sell","index_price":75792.94,"instrument_name":"BTC-27NOV26-60000-P","trade_seq":598,"amount":0.1,"mark_price":0.00129857,"tick_direction":1,"trade_id":"2"}` +
        `]}}`,
    );
    notify(conn, ch, [
      trade(123, 'BTC-7NOV26-76500-C'),
      trade(601, 'BTC-27NOV26-60000-P'),
    ]);
    const events = await collectUntil(
      it,
      (e) => e.type === 'trade' && e.data.tradeSeq === 601,
    );
    const trades = events.filter((e) => e.type === 'trade');
    assertEquals(trades.length, 4);
    const t0 = trades[0];
    assert(t0?.type === 'trade');
    assertEquals(t0.data.starbaseMatchId, '244571814334836736');
    assertEquals(t0.data.starbaseTimestamp, '1794000064462549818');
    assertEquals(t0.data.iv, 19.88);
    const gaps = events.filter((e) => e.type === 'gap');
    assertEquals(
      gaps.map((g) => g.type === 'gap' && [g.stream, g.expected, g.received]),
      [[`${ch}|BTC-27NOV26-60000-P`, 599, 601]],
    );
  });

  it('parses tickers, DVOL, the price index and each option mark', async () => {
    socket = new DeribitSocket({ url: server.url('/') });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    notify(conn, 'ticker.BTC-7NOV26-76000-C.100ms', {
      timestamp: 1794003630326,
      state: 'open',
      greeks: {
        delta: 0.43,
        gamma: 8.6e-4,
        vega: 9.9,
        theta: -89.8,
        rho: 0.36,
      },
      index_price: 75926.87,
      instrument_name: 'BTC-7NOV26-76000-C',
      mark_price: 0.0019,
      best_ask_price: 0.0021,
      best_bid_price: 0.0017,
      best_ask_amount: 1.6,
      best_bid_amount: 2.1,
      mark_iv: 18.11,
    });
    notify(conn, 'deribit_volatility_index.btc_usd', {
      timestamp: 1794003630490,
      index_name: 'btc_usd',
      volatility: 39.44,
    });
    notify(conn, 'deribit_price_index.btc_usd', {
      timestamp: 1794003630646,
      price: 75927.05,
      index_name: 'btc_usd',
    });
    notify(conn, 'markprice.options.btc_usd', [
      { timestamp: 1, iv: 0.3965, instrument_name: 'A', mark_price: 0.0065 },
      { timestamp: 1, iv: 0.6745, instrument_name: 'B', mark_price: 0.0001 },
    ]);
    notify(conn, 'book.BTC-PERPETUAL.none.10.100ms', { bids: [], asks: [] });
    const events = await collectUntil(it, isType('unknown'));
    assertEquals(events.map((e) => e.type).filter((t) => t !== 'connected'), [
      'ticker',
      'volatilityIndex',
      'priceIndex',
      'markPrice',
      'markPrice',
      'unknown',
    ]);
    const ticker = events.find((e) => e.type === 'ticker');
    assert(ticker?.type === 'ticker');
    assertEquals([ticker.data.markIv, ticker.data.greeks?.gamma], [
      18.11,
      8.6e-4,
    ]);
    const dvol = events.find((e) => e.type === 'volatilityIndex');
    assert(dvol?.type === 'volatilityIndex');
    assertEquals(dvol.data.volatility, 39.44);
  });

  it('delivers a malformed notification as invalid, never dropped', async () => {
    socket = new DeribitSocket({ url: server.url('/') });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    notify(conn, 'ticker.X.100ms', { instrument_name: 'X' });
    const events = await collectUntil(it, isType('invalid'));
    const invalid = events.at(-1);
    assert(invalid?.type === 'invalid');
    assertEquals(invalid.venueType, 'ticker');
  });

  it('reports a refused subscription (raw without auth) as a non-fatal error', async () => {
    socket = new DeribitSocket({
      url: server.url('/'),
      subscriptions: [{ channel: 'book.BTC-PERPETUAL.raw' }],
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    const req = await request(conn, 'public/subscribe');
    conn.send({
      jsonrpc: '2.0',
      id: req.id,
      error: {
        code: 13778,
        message: 'raw_subscriptions_not_available_for_unauthorized',
      },
    });
    const events = await collectUntil(it, isType('error'));
    const err = events.at(-1);
    assert(err?.type === 'error' && !err.fatal);
    assertEquals(err.error.code, 'SOCKET_SUBSCRIBE_FAILED');
    assertEquals(err.error.getContextValue('vendorCode'), 13778);
    assertEquals(err.error.getContextValue('channels'), [
      'book.BTC-PERPETUAL.raw',
    ]);
  });

  it('re-authenticates and resubscribes on reconnect; trade gaps span the outage', async () => {
    socket = new DeribitSocket({
      url: server.url('/'),
      auth: AUTH,
      subscriptions: [
        { kind: 'trades', instrument: 'BTC-PERPETUAL' },
        { kind: 'book', instrument: 'BTC-PERPETUAL' },
      ],
      reconnect: { initialDelayMs: 5, maxDelayMs: 10 },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const first = await server.connection(1);
    await answer(first, 'public/auth', authResult());
    await request(first, 'private/subscribe');
    notify(first, 'trades.BTC-PERPETUAL.raw', [trade(10)]);
    notify(first, 'book.BTC-PERPETUAL.raw', book('snapshot', 100));
    await collectUntil(it, isType('book'));
    first.close();

    await collectUntil(it, (e) => e.type === 'connected' && e.reconnected);
    const second = await server.connection(2);
    await answer(second, 'public/auth', authResult());
    const sub = await request(second, 'private/subscribe');
    assertEquals(sub.params.channels, [
      'trades.BTC-PERPETUAL.raw',
      'book.BTC-PERPETUAL.raw',
    ]);
    // A new snapshot restarts the book chain: no false gap.
    notify(second, 'book.BTC-PERPETUAL.raw', book('snapshot', 500));
    notify(second, 'book.BTC-PERPETUAL.raw', book('change', 510, 500));
    notify(second, 'trades.BTC-PERPETUAL.raw', [trade(15)]);
    const events = await collectUntil(it, isType('trade'));
    const gaps = events.filter((e) => e.type === 'gap');
    assertEquals(
      gaps.map((g) => g.type === 'gap' && [g.stream, g.expected, g.received]),
      [['trades.BTC-PERPETUAL.raw|BTC-PERPETUAL', 11, 15]],
    );
  });

  it('subscribes and unsubscribes on the open connection', async () => {
    socket = new DeribitSocket({ url: server.url('/') });
    await socket.connect();
    const conn = await server.connection();
    await request(conn, 'public/set_heartbeat');
    socket.subscribe([
      { kind: 'markPrice', index: 'btc_usd' },
      { kind: 'markPrice', index: 'btc_usd' },
    ]);
    const sub = await request(conn, 'public/subscribe');
    assertEquals(sub.params.channels, ['markprice.options.btc_usd']);
    socket.unsubscribe([{ kind: 'markPrice', index: 'btc_usd' }]);
    const unsub = await request(conn, 'public/unsubscribe');
    assertEquals(unsub.params.channels, ['markprice.options.btc_usd']);
    assertEquals(socket.channels, []);
  });
});

// ── Live ─────────────────────────────────────────────────────────────────────
// Public 100ms channels need no credentials; opt in with LIVE_TEST_SOCKETS.
// Raw channels run when a Deribit key is configured.

const liveEnv = envArgs();
const liveSockets = !!liveEnv.get('LIVE_TEST_SOCKETS');
const liveAuth = {
  clientId: liveEnv.get('CONNECTOR_DERIBIT_CLIENT_ID'),
  clientSecret: liveEnv.get('CONNECTOR_DERIBIT_CLIENT_SECRET'),
};
const liveEnvironment =
  liveEnv.get('CONNECTOR_DERIBIT_ENVIRONMENT') === 'testnet'
    ? 'testnet'
    : 'production';

describe({
  name: 'DeribitSocket — live',
  ignore: !liveSockets,
  bun: false,
  node: false,
  fn: () => {
    it('streams the 100ms book, trades, ticker, DVOL, index and marks without auth', async () => {
      const socket = new DeribitSocket({
        subscriptions: [
          { kind: 'book', instrument: 'BTC-PERPETUAL' },
          { kind: 'ticker', instrument: 'BTC-PERPETUAL' },
          { kind: 'volatilityIndex', index: 'btc_usd' },
          { kind: 'priceIndex', index: 'btc_usd' },
          { kind: 'markPrice', index: 'btc_usd' },
        ],
        signal: AbortSignal.timeout(20_000),
      });
      const seen = new Set<string>();
      for await (const event of socket) {
        if (event.type === 'invalid') throw event.error;
        if (event.type === 'error') throw event.error;
        seen.add(event.type);
        if (
          ['book', 'ticker', 'volatilityIndex', 'priceIndex', 'markPrice']
            .every((t) => seen.has(t))
        ) break;
      }
      assert(seen.has('book') && seen.has('markPrice'), `saw ${[...seen]}`);
    });

    it('is refused raw channels without auth (error 13778)', async () => {
      const socket = new DeribitSocket({
        subscriptions: [{ channel: 'book.BTC-PERPETUAL.raw' }],
        signal: AbortSignal.timeout(15_000),
      });
      for await (const event of socket) {
        if (event.type === 'error') {
          assertEquals(event.error.getContextValue('vendorCode'), 13778);
          break;
        }
      }
    });

    it({
      name: 'streams raw channels with a read-only key',
      ignore: !liveAuth.clientId || !liveAuth.clientSecret,
      fn: async () => {
        const socket = new DeribitSocket({
          environment: liveEnvironment,
          auth: {
            type: 'CUSTOM',
            clientId: liveAuth.clientId!,
            clientSecret: liveAuth.clientSecret!,
          },
          subscriptions: [{ kind: 'book', instrument: 'BTC-PERPETUAL' }],
          signal: AbortSignal.timeout(20_000),
        });
        assertEquals(socket.interval, 'raw');
        let authenticated = false;
        for await (const event of socket) {
          if (event.type === 'error') throw event.error;
          if (event.type === 'authenticated') authenticated = true;
          if (event.type === 'book' && event.data.type === 'change') break;
        }
        assert(authenticated);
      },
    });
  },
});
