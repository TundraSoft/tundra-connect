import { afterEach, beforeEach, describe, it } from '@test';
import { assert, assertEquals } from '@asserts';
import {
  PolymarketLiveDataSocket,
  type PolymarketLiveDataSocketEvent,
} from './PolymarketLiveDataSocket.ts';
import { collectUntil, MockFeedServer } from './fixtures/MockFeedServer.ts';

const chainlink = (symbol: string, value: number) => ({
  connection_id: 'c1',
  payload: {
    full_accuracy_value: '79669147000000000',
    symbol,
    timestamp: 1792414377000,
    value,
  },
  timestamp: 1792414378326,
  topic: 'crypto_prices_chainlink',
  type: 'update',
});
const binance = (symbol: string) => ({
  connection_id: 'c1',
  payload: {
    full_accuracy_value: '1.30980000',
    symbol,
    timestamp: 1792414378000,
    value: 1.3098,
  },
  timestamp: 1792414378173,
  topic: 'crypto_prices',
  type: 'update',
});

const isType = (t: string) => (e: PolymarketLiveDataSocketEvent) =>
  e.type === t;

describe('PolymarketLiveDataSocket', () => {
  let server: MockFeedServer;
  let socket: PolymarketLiveDataSocket | undefined;

  beforeEach(async () => {
    server = await MockFeedServer.start();
  });
  afterEach(async () => {
    await socket?.close();
    socket = undefined;
    await server.stop();
  });

  it('subscribes each topic unfiltered and filters symbols client-side', async () => {
    socket = new PolymarketLiveDataSocket({
      url: server.url(),
      sources: { chainlink: ['BTC/USD'], binance: 'all' },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    await conn.waitFor((f) => f.includes('subscribe'));
    assertEquals(conn.json()[0], {
      action: 'subscribe',
      subscriptions: [
        { topic: 'crypto_prices_chainlink', type: '*', filters: '' },
        { topic: 'crypto_prices', type: 'update', filters: '' },
      ],
    });
    conn.send(chainlink('eth/usd', 4000)); // filtered out
    conn.send(chainlink('btc/usd', 82000));
    conn.send(binance('xrpusdt'));
    const events = await collectUntil(
      it,
      (e) => e.type === 'price' && e.source === 'binance',
    );
    const prices = events.filter((e) => e.type === 'price');
    assertEquals(prices.length, 2);
    const cl = prices[0];
    assert(cl?.type === 'price' && cl.source === 'chainlink');
    assertEquals(cl.data.payload.symbol, 'btc/usd');
    assertEquals(cl.data.payload.fullAccuracyValue, '79669147000000000');
    assertEquals(cl.venueTimestamp, 1792414377000);
  });

  it('subscribe/unsubscribe while connected', async () => {
    socket = new PolymarketLiveDataSocket({ url: server.url() });
    await socket.connect();
    const conn = await server.connection();
    socket.subscribe('binance', ['btcusdt']);
    socket.subscribe('binance', ['ethusdt']); // widens, no new frame
    socket.unsubscribe('binance', ['btcusdt']); // one symbol left, no frame
    socket.unsubscribe('binance');
    await conn.waitFor((f) => f.includes('unsubscribe'));
    assertEquals(conn.json(), [
      {
        action: 'subscribe',
        subscriptions: [{
          topic: 'crypto_prices',
          type: 'update',
          filters: '',
        }],
      },
      {
        action: 'unsubscribe',
        subscriptions: [{
          topic: 'crypto_prices',
          type: 'update',
          filters: '',
        }],
      },
    ]);
  });

  it('reconnects when subscribed but the price data stops', async () => {
    socket = new PolymarketLiveDataSocket({
      url: server.url(),
      sources: { chainlink: 'all' },
      heartbeatIntervalMs: 20,
      dataTimeoutMs: 120,
      reconnect: { initialDelayMs: 5, maxDelayMs: 10 },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    await conn.waitFor((f) => f === 'PING');
    const events = await collectUntil(
      it,
      (e) => e.type === 'connected' && e.reconnected,
    );
    const d = events.find((e) => e.type === 'disconnected');
    assert(d?.type === 'disconnected' && d.reason.includes('no data'));
  });

  it('emits unknown topics', async () => {
    socket = new PolymarketLiveDataSocket({ url: server.url() });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    (await server.connection()).send({ topic: 'activity', payload: {} });
    const events = await collectUntil(it, isType('unknown'));
    assertEquals(events.at(-1)?.type, 'unknown');
  });
});
