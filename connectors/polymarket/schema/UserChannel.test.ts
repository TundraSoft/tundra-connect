import { describe, it } from '@test';
import { assert, assertEquals } from '@asserts';
import {
  PolymarketUserOrderSchemaObject,
  PolymarketUserTradeSchemaObject,
} from './UserChannel.ts';

describe('UserChannel schemas', () => {
  it('order: normalizes and keeps unmodelled fields', () => {
    const [error, order] = PolymarketUserOrderSchemaObject.safeParse({
      event_type: 'order',
      id: '0x1',
      market: '0xc',
      asset_id: '1',
      side: 'BUY',
      price: '0.52',
      original_size: '10',
      size_matched: '4',
      type: 'UPDATE',
      status: 'LIVE',
      associate_trades: null,
      timestamp: '1782753357257',
    });
    assertEquals(error, null);
    assertEquals([order?.sizeMatched, order?.originalSize], [4, 10]);
    assertEquals((order as Record<string, unknown>).associateTrades, null);
  });

  it('order: requires an id', () => {
    const [error] = PolymarketUserOrderSchemaObject.safeParse({
      event_type: 'order',
      id: '',
      market: '0xc',
      asset_id: '1',
      side: 'BUY',
      price: '0.52',
      original_size: '10',
      size_matched: '0',
      type: 'PLACEMENT',
      timestamp: '1',
    });
    assert(error);
  });

  it('trade: null hashes become absent, maker orders are camelCased', () => {
    const [error, trade] = PolymarketUserTradeSchemaObject.safeParse({
      event_type: 'trade',
      id: 't',
      market: '0xc',
      asset_id: '1',
      side: 'SELL',
      size: '5',
      price: '0.4',
      status: 'MINED',
      transaction_hash: null,
      maker_orders: [{ order_id: '0xm', matched_amount: '5' }],
      timestamp: '1782753357257',
    });
    assertEquals(error, null);
    assertEquals(trade?.transactionHash, undefined);
    assertEquals(trade?.makerOrders[0]?.orderId, '0xm');
  });

  it('trade: defaults missing maker orders to []', () => {
    const [, trade] = PolymarketUserTradeSchemaObject.safeParse({
      event_type: 'trade',
      id: 't',
      market: '0xc',
      asset_id: '1',
      side: 'SELL',
      size: '5',
      price: '0.4',
      status: 'MATCHED',
      timestamp: '1',
    });
    assertEquals(trade?.makerOrders, []);
  });
});
