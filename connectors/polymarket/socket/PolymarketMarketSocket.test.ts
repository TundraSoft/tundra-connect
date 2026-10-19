import { afterEach, beforeEach, describe, it } from '@test';
import { assert, assertEquals } from '@asserts';
import {
  PolymarketMarketSocket,
  type PolymarketMarketSocketEvent,
} from './PolymarketMarketSocket.ts';
import { collectUntil, MockFeedServer } from './fixtures/MockFeedServer.ts';
import { envArgs } from '@utils';
import { PolymarketLiveDataSocket } from './PolymarketLiveDataSocket.ts';

const BOOK = {
  market: '0xa69e',
  asset_id: '1701',
  timestamp: '1792414397301',
  hash: '227bdd8e',
  bids: [],
  asks: [{ price: '0.999', size: '31019440.72' }, {
    price: '0.998',
    size: '10160',
  }],
  tick_size: '0.001',
  event_type: 'book',
  last_trade_price: '0.001',
};
const PRICE_CHANGE = {
  market: '0xa69e',
  price_changes: [
    {
      asset_id: '6172',
      price: '0.981',
      size: '1050',
      side: 'BUY',
      hash: 'b3ca',
      best_bid: '0.999',
      best_ask: '1',
    },
    {
      asset_id: '1701',
      price: '0.019',
      size: '0',
      side: 'SELL',
      hash: '4fe8',
      best_bid: '0',
      best_ask: '0.001',
    },
  ],
  timestamp: '1792414421124',
  event_type: 'price_change',
};

const isType = (t: string) => (e: PolymarketMarketSocketEvent) => e.type === t;

describe('PolymarketMarketSocket', () => {
  let server: MockFeedServer;
  let socket: PolymarketMarketSocket | undefined;

  beforeEach(async () => {
    server = await MockFeedServer.start();
  });
  afterEach(async () => {
    await socket?.close();
    socket = undefined;
    await server.stop();
  });

  it('sends the market handshake with custom features, even with no assets', async () => {
    socket = new PolymarketMarketSocket({ url: server.url() });
    await socket.connect();
    const conn = await server.connection();
    await conn.waitFor((f) => f.includes('"type":"market"'));
    assertEquals(conn.json()[0], {
      assets_ids: [],
      type: 'market',
      custom_feature_enabled: true,
    });
  });

  it('subscribes in batches of 100 and resubscribes everything on reconnect', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => String(i));
    socket = new PolymarketMarketSocket({
      url: server.url(),
      assetIds: ids,
      customFeatures: false,
      reconnect: { initialDelayMs: 5, maxDelayMs: 10 },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const first = await server.connection(1);
    await first.waitFor((f) => f.includes('"operation":"subscribe"'));
    const frames = first.json();
    assertEquals(frames[0], { assets_ids: ids.slice(0, 100), type: 'market' });
    assertEquals(frames[1], {
      operation: 'subscribe',
      assets_ids: ids.slice(100),
    });

    first.close();
    await collectUntil(it, (e) => e.type === 'connected' && e.reconnected);
    const second = await server.connection(2);
    await second.waitFor((f) => f.includes('"operation":"subscribe"'));
    assertEquals(
      (second.json()[0] as { assets_ids: string[] }).assets_ids.length,
      100,
    );
  });

  it('sends subscribe/unsubscribe updates while connected', async () => {
    socket = new PolymarketMarketSocket({ url: server.url() });
    await socket.connect();
    const conn = await server.connection();
    socket.subscribe(['a', 'b']);
    socket.subscribe(['a']); // already subscribed: no frame
    socket.unsubscribe(['b', 'zzz']);
    await conn.waitFor((f) => f.includes('unsubscribe'));
    assertEquals(conn.json().slice(1), [
      {
        operation: 'subscribe',
        assets_ids: ['a', 'b'],
        custom_feature_enabled: true,
      },
      { operation: 'unsubscribe', assets_ids: ['b'] },
    ]);
    assertEquals(socket.assetIds, ['a']);
  });

  it('parses a batched book frame and a price change at every level', async () => {
    socket = new PolymarketMarketSocket({
      url: server.url(),
      includeRaw: true,
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    const frame = JSON.stringify([BOOK]);
    conn.send(frame);
    conn.send(PRICE_CHANGE);
    const events = await collectUntil(it, isType('price_change'));
    const book = events.find((e) => e.type === 'book');
    assert(book?.type === 'book');
    assertEquals(book.venueTimestamp, 1792414397301);
    assertEquals(book.data.asks[0], { price: 0.999, size: 31019440.72 });
    assertEquals(book.data.tickSize, 0.001);
    assertEquals(book.data.lastTradePrice, 0.001);
    assertEquals(book.raw, frame);
    const change = events.at(-1);
    assert(change?.type === 'price_change');
    assertEquals(change.data.priceChanges.length, 2);
    assertEquals(change.data.priceChanges[1]?.size, 0);
  });

  it('answers PING, ignores PONG and reports plain-text errors', async () => {
    socket = new PolymarketMarketSocket({ url: server.url() });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    conn.send('PONG');
    conn.send('PING');
    await conn.waitFor((f) => f === 'PONG');
    conn.send('INVALID OPERATION');
    const events = await collectUntil(it, isType('error'));
    const err = events.at(-1);
    assert(err?.type === 'error' && !err.fatal);
    assertEquals(err.error.code, 'SOCKET_VENUE_ERROR');
  });

  it('delivers unknown types and invalid messages instead of dropping them', async () => {
    socket = new PolymarketMarketSocket({ url: server.url() });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    conn.send({ event_type: 'brand_new', x: 1 });
    conn.send({ ...BOOK, timestamp: 'not-a-number' });
    const events = await collectUntil(it, isType('invalid'));
    assertEquals(events.map((e) => e.type), ['unknown', 'invalid']);
    const invalid = events[1];
    assert(invalid?.type === 'invalid');
    assertEquals(invalid.venueType, 'book');
    assertEquals(invalid.error.code, 'SOCKET_INVALID_MESSAGE');
  });

  it('sends PING heartbeats and reconnects when PONGs stop', async () => {
    socket = new PolymarketMarketSocket({
      url: server.url(),
      heartbeatIntervalMs: 20,
      idleTimeoutMs: 150,
      reconnect: { initialDelayMs: 5, maxDelayMs: 10 },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    await conn.waitFor((f) => f === 'PING');
    await collectUntil(it, (e) => e.type === 'connected' && e.reconnected);
  });
});

// ── Live ─────────────────────────────────────────────────────────────────────
// Public feeds need no credentials, so the opt-in is LIVE_TEST_SOCKETS
// (set by the monthly live-tests workflow) rather than a secret.

const liveEnv = envArgs();
const liveSockets = !!liveEnv.get('LIVE_TEST_SOCKETS');

describe({
  name: 'PolymarketMarketSocket — live',
  ignore: !liveSockets,
  bun: false,
  node: false,
  fn: () => {
    it('streams full books and level changes for the busiest markets', async () => {
      const res = await fetch(
        'https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=3',
      );
      const markets = await res.json() as { clobTokenIds: string }[];
      const assetIds = markets.flatMap((m) =>
        JSON.parse(m.clobTokenIds) as string[]
      );
      const socket = new PolymarketMarketSocket({
        assetIds,
        signal: AbortSignal.timeout(20_000),
      });
      const seen = new Set<string>();
      for await (const event of socket) {
        seen.add(event.type);
        if (event.type === 'invalid') throw event.error;
        if (seen.has('book') && seen.has('price_change')) break;
      }
      assert(seen.has('book'), `saw ${[...seen]}`);
    });

    it('streams Chainlink and Binance reference prices', async () => {
      const socket = new PolymarketLiveDataSocket({
        sources: { chainlink: ['btc/usd'], binance: ['btcusdt'] },
        signal: AbortSignal.timeout(20_000),
      });
      const sources = new Set<string>();
      for await (const event of socket) {
        if (event.type === 'invalid') throw event.error;
        if (event.type === 'price') sources.add(event.source);
        if (sources.size === 2) break;
      }
      assertEquals([...sources].sort(), ['binance', 'chainlink']);
    });
  },
});
