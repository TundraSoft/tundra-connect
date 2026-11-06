import { describe, it } from '@test';
import { assert, assertEquals } from '@asserts';
import {
  PolymarketPriceBestBidAskSchemaObject,
  PolymarketPriceEnvelopeSchemaObject,
  PolymarketPriceSnapshotSchemaObject,
  PolymarketPriceUpdateSchemaObject,
} from './PriceChannel.ts';

describe('PriceChannel schemas', () => {
  it('PolyBolt update, snapshot and best bid/ask', () => {
    const [e1, update] = PolymarketPriceUpdateSchemaObject.safeParse({
      symbol: 'aapl',
      value: 1,
      full_accuracy_value: '1.00',
      timestamp: 2,
      source: 'massive',
      received_at: 3,
      is_carried_forward: true,
    });
    assertEquals(e1, null);
    assertEquals([update?.receivedAt, update?.isCarriedForward], [3, true]);
    const [e2, snap] = PolymarketPriceSnapshotSchemaObject.safeParse({
      symbol: 'btcusd',
      source: 'chainlink',
      window_seconds: 60,
      data: [],
    });
    assertEquals(e2, null);
    assertEquals(snap?.windowSeconds, 60);
    const [e3, top] = PolymarketPriceBestBidAskSchemaObject.safeParse({
      market: '0xc',
      asset_id: '1',
      best_bid: '0.4',
      best_ask: '0.5',
      hash: 'h',
      timestamp: 1,
    });
    assertEquals(e3, null);
    assertEquals(top?.bestAsk, 0.5);
  });

  it('equity market_status on updates and snapshots; unknown values rejected', () => {
    const [e1, update] = PolymarketPriceUpdateSchemaObject.safeParse({
      symbol: 'aapl',
      value: 262.71,
      full_accuracy_value: '262.71',
      timestamp: 1792526399800,
      received_at: 1792526401200,
      is_carried_forward: true,
      source: 'pyth',
      market_status: 'closed',
    });
    assertEquals(e1, null);
    assertEquals(update?.marketStatus, 'closed');
    assertEquals(update?.isCarriedForward, true);
    const [e2, snap] = PolymarketPriceSnapshotSchemaObject.safeParse({
      symbol: 'usdbrl',
      source: 'pyth',
      market_status: 'closed',
      data: [{ value: 5.4, full_accuracy_value: '5.4012', timestamp: 1 }],
    });
    assertEquals(e2, null);
    assertEquals(snap?.marketStatus, 'closed');
    const [e3] = PolymarketPriceUpdateSchemaObject.safeParse({
      symbol: 'aapl',
      value: 1,
      full_accuracy_value: '1',
      timestamp: 1,
      source: 'pyth',
      market_status: 'halted',
    });
    assert(e3);
  });

  it('TWAP point keeps the full-precision value and its window', () => {
    const [error, twap] = PolymarketPriceUpdateSchemaObject.safeParse({
      symbol: 'btcusd',
      value: 64120.7,
      full_accuracy_value: '64120.700000000000000001',
      timestamp: 1788973002000,
      window_seconds: 60,
      source: 'chainlink',
    });
    assertEquals(error, null);
    assertEquals(twap?.fullAccuracyValue, '64120.700000000000000001');
    assertEquals(twap?.windowSeconds, 60);
  });

  it('envelope: integers must be numbers, not strings', () => {
    const [error] = PolymarketPriceEnvelopeSchemaObject.safeParse({
      v: 1,
      channel: 'price.crypto',
      seq: '1',
      ts: 1,
      payload: {},
    });
    assert(error);
    const [ok] = PolymarketPriceEnvelopeSchemaObject.safeParse({
      v: 1,
      channel: 'price.crypto',
      seq: 1,
      ts: 1,
      dropped: 2,
      payload: {},
    });
    assertEquals(ok, null);
  });
});
