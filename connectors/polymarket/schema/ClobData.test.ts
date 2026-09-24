import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ClobOpenOrderSchemaObject,
  ClobOpenOrdersPageSchemaObject,
  ClobOrderBookSchemaObject,
  ClobTradeSchemaObject,
  ClobTradesPageSchemaObject,
} from './ClobData.ts';

const ORDER = {
  id: '0xo1',
  status: 'LIVE',
  owner: 'uuid',
  maker_address: '0x1',
  market: '0xc',
  asset_id: '1',
  side: 'BUY',
  original_size: '10',
  size_matched: '0',
  price: '0.52',
  outcome: 'Yes',
  expiration: '0',
  order_type: 'GTC',
  created_at: 1748779200,
};

const TRADE = {
  id: 't1',
  taker_order_id: '0xo',
  market: '0xc',
  asset_id: '1',
  side: 'SELL',
  size: '10',
  price: '0.52',
  fee_rate_bps: '25',
  status: 'TRADE_STATUS_MATCHED',
  match_time: '1748779205',
  last_update: '1748779206',
  outcome: 'Yes',
  bucket_index: 0,
  owner: 'uuid',
  maker_address: '0x1',
  trader_side: 'MAKER',
};

describe('ClobData schemas', () => {
  it('normalizes an open order to camelCase with numeric fields', () => {
    const order = ClobOpenOrderSchemaObject.parse(ORDER);
    asserts.assertEquals(order.makerAddress, '0x1');
    asserts.assertEquals(order.assetId, '1');
    asserts.assertEquals(order.originalSize, 10);
    asserts.assertEquals(order.sizeMatched, 0);
    asserts.assertEquals(order.price, 0.52);
    asserts.assertEquals(order.expiration, 0);
    asserts.assertEquals(order.orderType, 'GTC');
    asserts.assertEquals(order.associateTrades, []); // absent -> []
    asserts.assertEquals(order.createdAt, 1748779200);
  });

  it('rejects an order with an unknown side or missing id', () => {
    asserts.assertExists(
      ClobOpenOrderSchemaObject.safeParse({ ...ORDER, side: 'HOLD' })[0],
    );
    asserts.assertExists(
      ClobOpenOrderSchemaObject.safeParse({ ...ORDER, id: '' })[0],
    );
  });

  it('accepts both the page envelope and a bare array, normalizing the end-of-pages cursor', () => {
    const paged = ClobOpenOrdersPageSchemaObject.parse({
      limit: 100,
      count: 1,
      next_cursor: 'MTAw',
      data: [ORDER],
    });
    asserts.assertEquals(paged.nextCursor, 'MTAw');
    asserts.assertEquals(paged.count, 1);
    asserts.assertEquals(paged.data.length, 1);
    for (const end of ['LTE=', '']) {
      const last = ClobOpenOrdersPageSchemaObject.parse({
        data: [],
        next_cursor: end,
      });
      asserts.assertEquals(last.nextCursor, undefined);
    }
    const bare = ClobOpenOrdersPageSchemaObject.parse([ORDER]);
    asserts.assertEquals(bare.data.length, 1);
    asserts.assertEquals(bare.nextCursor, undefined);
    asserts.assertEquals(ClobOpenOrdersPageSchemaObject.parse({}).data, []);
  });

  it('normalizes a trade, defaulting maker_orders and keeping the null transaction hash absent', () => {
    const trade = ClobTradeSchemaObject.parse({
      ...TRADE,
      transaction_hash: null,
    });
    asserts.assertEquals(trade.takerOrderId, '0xo');
    asserts.assertEquals(trade.side, 'SELL');
    asserts.assertEquals(trade.traderSide, 'MAKER');
    asserts.assertEquals(trade.feeRateBps, 25);
    asserts.assertEquals(trade.matchTime, 1748779205);
    asserts.assertEquals(trade.lastUpdate, 1748779206);
    asserts.assertEquals(trade.transactionHash, undefined);
    asserts.assertEquals(trade.makerOrders, []);
    const page = ClobTradesPageSchemaObject.parse({
      data: [TRADE],
      next_cursor: 'LTE=',
    });
    asserts.assertEquals(page.data[0]!.id, 't1');
    asserts.assertEquals(page.nextCursor, undefined);
  });

  it('rejects a trade with an unknown trader side', () => {
    asserts.assertExists(
      ClobTradeSchemaObject.safeParse({ ...TRADE, trader_side: 'BOTH' })[0],
    );
  });

  it('parses an order book with numeric levels and vendor ordering preserved', () => {
    const book = ClobOrderBookSchemaObject.parse({
      market: '0xc',
      asset_id: '1',
      timestamp: '1782753357257',
      hash: 'h',
      bids: [{ price: '0.01', size: '100' }, { price: '0.50', size: '20' }],
      asks: [{ price: '0.99', size: '50' }, { price: '0.52', size: '5' }],
      min_order_size: '5',
      tick_size: '0.001',
      neg_risk: true,
      last_trade_price: '0.51',
    });
    asserts.assertEquals(book.timestamp, 1782753357257);
    asserts.assertEquals(book.bids, [{ price: 0.01, size: 100 }, {
      price: 0.5,
      size: 20,
    }]);
    asserts.assertEquals(book.asks.at(-1), { price: 0.52, size: 5 });
    asserts.assertEquals(book.tickSize, 0.001);
    asserts.assertEquals(book.negRisk, true);
    asserts.assertEquals(book.lastTradePrice, 0.51);
  });

  it('defaults empty book sides to [] and an unparseable tick size to 0.01', () => {
    const book = ClobOrderBookSchemaObject.parse({
      market: '0xc',
      asset_id: '1',
      timestamp: '1',
      hash: 'h',
      min_order_size: '5',
      tick_size: 'n/a',
      neg_risk: false,
      last_trade_price: '0',
    });
    asserts.assertEquals(book.bids, []);
    asserts.assertEquals(book.asks, []);
    asserts.assertEquals(book.tickSize, 0.01);
  });
});
