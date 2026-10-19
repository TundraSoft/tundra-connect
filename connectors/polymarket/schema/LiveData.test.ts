import { describe, it } from '@test';
import { assert, assertEquals } from '@asserts';
import {
  PolymarketLiveDataPriceSchemaObject,
  PolymarketPriceBestBidAskSchemaObject,
  PolymarketPriceEnvelopeSchemaObject,
  PolymarketPriceSnapshotSchemaObject,
  PolymarketPriceUpdateSchemaObject,
} from './LiveData.ts';

describe('LiveData schemas', () => {
  it('legacy price: keeps the exact value as a string', () => {
    const [error, price] = PolymarketLiveDataPriceSchemaObject.safeParse({
      connection_id: 'c',
      payload: {
        full_accuracy_value: '79669147000000000',
        symbol: 'doge/usd',
        timestamp: 1792414377000,
        value: 0.079669147,
      },
      timestamp: 1792414378326,
      topic: 'crypto_prices_chainlink',
      type: 'update',
    });
    assertEquals(error, null);
    assertEquals(price?.payload.fullAccuracyValue, '79669147000000000');
    assertEquals(price?.connectionId, 'c');
  });

  it('legacy price: requires a payload symbol', () => {
    const [error] = PolymarketLiveDataPriceSchemaObject.safeParse({
      payload: { timestamp: 1, value: 1 },
      timestamp: 1,
      topic: 'crypto_prices',
      type: 'update',
    });
    assert(error);
  });

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
