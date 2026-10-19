import { afterEach, beforeEach, describe, it } from '@test';
import { assert, assertEquals, assertThrows } from '@asserts';
import { PolymarketError } from '../errors/mod.ts';
import {
  PolymarketUserSocket,
  type PolymarketUserSocketEvent,
} from './PolymarketUserSocket.ts';
import { collectUntil, MockFeedServer } from './fixtures/MockFeedServer.ts';

const CREDS = { apiKey: 'k', secret: 's', passphrase: 'p' };
const TRADE = {
  event_type: 'trade',
  type: 'TRADE',
  id: 't-1',
  taker_order_id: '0xorder',
  market: '0xc',
  asset_id: '1',
  side: 'BUY',
  size: '10',
  fee_rate_bps: '0',
  price: '0.52',
  status: 'MATCHED',
  match_time: '1782753357',
  last_update: '1782753357',
  outcome: 'Yes',
  owner: 'k',
  maker_address: '0xm',
  transaction_hash: null,
  bucket_index: 0,
  maker_orders: [{
    order_id: '0xmaker',
    matched_amount: '10',
    price: '0.52',
    side: 'SELL',
  }],
  trader_side: 'TAKER',
  timestamp: '1782753357257',
};
const ORDER = {
  event_type: 'order',
  id: '0xorder',
  market: '0xc',
  asset_id: '1',
  side: 'BUY',
  original_size: '10',
  size_matched: '0',
  price: '0.52',
  associate_trades: null,
  outcome: 'Yes',
  type: 'PLACEMENT',
  created_at: '1782753357',
  expiration: '0',
  order_type: 'GTC',
  status: 'LIVE',
  timestamp: '1782753357257',
};

const isType = (t: string) => (e: PolymarketUserSocketEvent) => e.type === t;

describe('PolymarketUserSocket', () => {
  let server: MockFeedServer;
  let socket: PolymarketUserSocket | undefined;

  beforeEach(async () => {
    server = await MockFeedServer.start();
  });
  afterEach(async () => {
    await socket?.close();
    socket = undefined;
    await server.stop();
  });

  it('requires CLOB API credentials', () => {
    const err = assertThrows(
      () => new PolymarketUserSocket({ auth: {} }),
      PolymarketError,
    );
    assertEquals(err.code, 'SOCKET_MISSING_CREDENTIALS');
  });

  it('authenticates on every connection with the market filter', async () => {
    socket = new PolymarketUserSocket({
      url: server.url(),
      auth: { apiCredentials: CREDS },
      markets: ['0xc'],
      reconnect: { initialDelayMs: 5, maxDelayMs: 10 },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const first = await server.connection(1);
    await first.waitFor((f) => f.includes('"auth"'));
    assertEquals(first.json()[0], {
      auth: { apiKey: 'k', secret: 's', passphrase: 'p' },
      type: 'user',
      markets: ['0xc'],
    });
    first.close();
    await collectUntil(it, (e) => e.type === 'connected' && e.reconnected);
    const second = await server.connection(2);
    await second.waitFor((f) => f.includes('"auth"'));
  });

  it('omits markets (all markets) and sends filter changes', async () => {
    socket = new PolymarketUserSocket({
      url: server.url(),
      auth: { apiCredentials: CREDS },
    });
    await socket.connect();
    const conn = await server.connection();
    socket.subscribe(['0xa']);
    socket.unsubscribe(['0xa']);
    await conn.waitFor((f) => f.includes('unsubscribe'));
    assertEquals(conn.json(), [
      { auth: { apiKey: 'k', secret: 's', passphrase: 'p' }, type: 'user' },
      { operation: 'subscribe', markets: ['0xa'] },
      { operation: 'unsubscribe', markets: ['0xa'] },
    ]);
  });

  it('delivers every trade status and order event, without de-duplication', async () => {
    socket = new PolymarketUserSocket({
      url: server.url(),
      auth: { apiCredentials: CREDS },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    conn.send(ORDER);
    conn.send([TRADE, { ...TRADE, status: 'MINED' }]);
    conn.send({ ...TRADE, status: 'CONFIRMED', transaction_hash: '0xtx' });
    const events = await collectUntil(
      it,
      (e) => e.type === 'trade' && e.data.status === 'CONFIRMED',
    );
    const data = events.filter((e) => e.type === 'order' || e.type === 'trade');
    assertEquals(data.length, 4);
    const order = data[0];
    assert(order?.type === 'order');
    assertEquals(order.data.originalSize, 10);
    assertEquals(order.data.type, 'PLACEMENT');
    const trades = data.slice(1);
    assertEquals(
      trades.map((e) => e.type === 'trade' && e.data.status),
      ['MATCHED', 'MINED', 'CONFIRMED'],
    );
    const first = trades[0];
    assert(first?.type === 'trade');
    assertEquals(first.data.transactionHash, undefined);
    assertEquals(first.data.makerOrders[0]?.matchedAmount, '10');
    assertEquals(first.venueTimestamp, 1782753357257);
    const last = trades[2];
    assert(last?.type === 'trade' && last.data.transactionHash === '0xtx');
  });
});
