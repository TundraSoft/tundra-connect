import { afterEach, beforeEach, describe, it } from '@test';
import { assert, assertEquals } from '@asserts';
import {
  PolymarketPriceSocket,
  type PolymarketPriceSocketEvent,
} from './PolymarketPriceSocket.ts';
import { collectUntil, MockFeedServer } from './fixtures/MockFeedServer.ts';
import { envArgs } from '@utils';
import { PolymarketUserSocket } from './PolymarketUserSocket.ts';

const CREDS = { apiKey: 'k', secret: 's', passphrase: 'p' };
const live = (seq: number, extra: Record<string, unknown> = {}) => ({
  v: 1,
  channel: 'price.crypto',
  seq,
  ts: 1788886177000 + seq,
  payload: {
    symbol: 'btcusd',
    value: 78794.15450441,
    full_accuracy_value: '78794.15450441',
    timestamp: 1788886177000 + seq,
    source: 'chainlink',
  },
  ...extra,
});

const isType = (t: string) => (e: PolymarketPriceSocketEvent) => e.type === t;

describe('PolymarketPriceSocket', () => {
  let server: MockFeedServer;
  let socket: PolymarketPriceSocket | undefined;

  beforeEach(async () => {
    server = await MockFeedServer.start();
  });
  afterEach(async () => {
    await socket?.close();
    socket = undefined;
    await server.stop();
  });

  it('authenticates, waits for authed, then subscribes', async () => {
    socket = new PolymarketPriceSocket({
      url: server.url(),
      auth: { apiCredentials: CREDS },
      subscriptions: [{
        channel: 'price.crypto.twap',
        filter: { symbol: 'BTCUSD', windowSeconds: 60 },
      }],
    });
    await socket.connect();
    const conn = await server.connection();
    await conn.waitFor((f) => f.includes('"op":"auth"'));
    assertEquals(conn.json()[0], {
      op: 'auth',
      rid: 'auth',
      auth: { apiKey: 'k', secret: 's', passphrase: 'p' },
    });
    await new Promise((r) => setTimeout(r, 50));
    assertEquals(conn.received.length, 1, 'no subscribe before authed');
    conn.send({ op: 'authed', rid: 'auth' });
    await conn.waitFor((f) => f.includes('"op":"subscribe"'));
    assertEquals(conn.json()[1], {
      op: 'subscribe',
      subscriptions: [{
        channel: 'price.crypto.twap',
        filter: { symbol: 'btcusd', window_seconds: 60 },
      }],
    });
  });

  it('parses snapshot batches and live points, and reports seq gaps and drops', async () => {
    socket = new PolymarketPriceSocket({
      url: server.url(),
      subscriptions: [{
        channel: 'price.crypto',
        filter: { symbol: 'btcusd' },
      }],
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    await conn.waitFor((f) => f.includes('subscribe'));
    conn.send({ op: 'subscribed', channel: 'price.crypto' });
    conn.send({
      v: 1,
      channel: 'price.crypto',
      seq: 1,
      ts: 1788886177000,
      snapshot: true,
      payload: {
        symbol: 'btcusd',
        source: 'chainlink',
        data: [{ value: 1, full_accuracy_value: '1', timestamp: 1 }],
      },
    });
    conn.send(live(2));
    conn.send(live(4, { dropped: 3 }));
    const events = await collectUntil(
      it,
      (e) => e.type === 'price' && e.seq === 4,
    );
    const types = events.map((e) => e.type);
    assertEquals(types, ['price_snapshot', 'price', 'gap', 'gap', 'price']);
    const snapshot = events[0];
    assert(snapshot?.type === 'price_snapshot' && snapshot.snapshot);
    assertEquals(snapshot.data.data[0]?.fullAccuracyValue, '1');
    const price = events[1];
    assert(price?.type === 'price');
    assertEquals(price.data.fullAccuracyValue, '78794.15450441');
    const seqGap = events[2];
    assert(
      seqGap?.type === 'gap' && seqGap.expected === 3 && seqGap.received === 4,
    );
    const dropGap = events[3];
    assert(dropGap?.type === 'gap' && dropGap.missed === 3);
  });

  it('parses price.polymarket top-of-book', async () => {
    socket = new PolymarketPriceSocket({ url: server.url() });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    (await server.connection()).send({
      v: 1,
      channel: 'price.polymarket',
      seq: 1,
      ts: 5,
      payload: {
        market: '0xc',
        asset_id: '1',
        best_bid: '0.4',
        best_ask: '0.41',
        hash: 'h',
        timestamp: 5,
      },
    });
    const events = await collectUntil(it, isType('best_bid_ask'));
    const bba = events.at(-1);
    assert(bba?.type === 'best_bid_ask');
    assertEquals([bba.data.bestBid, bba.data.bestAsk], [0.4, 0.41]);
  });

  it('auth_invalid is fatal', async () => {
    socket = new PolymarketPriceSocket({
      url: server.url(),
      auth: { apiCredentials: CREDS },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    (await server.connection()).send({
      op: 'error',
      code: 'auth_invalid',
      rid: 'auth',
    });
    const events = await collectUntil(it, () => false);
    const fatal = events.at(-1);
    assert(fatal?.type === 'error' && fatal.fatal);
    assertEquals(fatal.error.code, 'SOCKET_AUTH_FAILED');
  });

  it('close 4008 is fatal; close 4003 reconnects', async () => {
    socket = new PolymarketPriceSocket({
      url: server.url(),
      reconnect: { initialDelayMs: 5, maxDelayMs: 10 },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    (await server.connection(1)).close(4003, 'draining');
    await collectUntil(it, (e) => e.type === 'connected' && e.reconnected);
    (await server.connection(2)).close(4008, 'rate_limited');
    const events = await collectUntil(it, () => false);
    const fatal = events.at(-1);
    assert(fatal?.type === 'error' && fatal.fatal);
    assertEquals(fatal.error.code, 'SOCKET_VENUE_ERROR');
  });

  it('reports non-fatal venue error acks', async () => {
    socket = new PolymarketPriceSocket({ url: server.url() });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    (await server.connection()).send({
      op: 'error',
      code: 'bad_filter',
      channel: 'price.crypto',
    });
    const events = await collectUntil(it, isType('error'));
    const err = events.at(-1);
    assert(err?.type === 'error' && !err.fatal);
    assertEquals(err.error.getContextValue('venueCode'), 'bad_filter');
  });
});

// ── Live ─────────────────────────────────────────────────────────────────────
// Needs CLOB L2 API credentials. Read-only: authenticates and streams one
// public reference price; never places or cancels an order.

const liveEnv = envArgs();
const apiCredentials = {
  apiKey: liveEnv.get('CONNECTOR_POLYMARKET_API_KEY') ?? '',
  secret: liveEnv.get('CONNECTOR_POLYMARKET_API_SECRET') ?? '',
  passphrase: liveEnv.get('CONNECTOR_POLYMARKET_API_PASSPHRASE') ?? '',
};
const liveTestsEnabled = Object.values(apiCredentials).every((v) => !!v);

describe({
  name: 'Polymarket sockets (authenticated) — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('PolyBolt: authenticates and streams a Chainlink BTC price', async () => {
      const socket = new PolymarketPriceSocket({
        auth: { apiCredentials },
        subscriptions: [{
          channel: 'price.crypto',
          filter: { symbol: 'btcusd' },
        }],
        signal: AbortSignal.timeout(20_000),
      });
      let got: string | undefined;
      for await (const event of socket) {
        if (event.type === 'error' || event.type === 'invalid') {
          throw event.error;
        }
        if (event.type === 'price' || event.type === 'price_snapshot') {
          got = event.type;
          break;
        }
      }
      assert(got, 'no price within 20s');
    });

    it('user channel: authenticates and stays connected', async () => {
      const socket = new PolymarketUserSocket({
        auth: { apiCredentials },
        signal: AbortSignal.timeout(8_000),
      });
      const types: string[] = [];
      for await (const event of socket) {
        types.push(event.type);
        if (event.type === 'error' || event.type === 'invalid') {
          throw event.error;
        }
      }
      assertEquals(types.filter((t) => t === 'connected').length, 1);
    });
  },
});
