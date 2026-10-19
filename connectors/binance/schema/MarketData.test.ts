import { describe, it } from '@test';
import { assert, assertEquals } from '@asserts';
import {
  BinanceBookTickerSchemaObject,
  BinanceDepthUpdateSchemaObject,
  BinanceTradeSchemaObject,
} from './MarketData.ts';

describe('Binance market-data schemas', () => {
  it('trade: renames case-sensitive keys and keeps the rest', () => {
    const [error, trade] = BinanceTradeSchemaObject.safeParse({
      e: 'trade',
      E: 1792414402540,
      s: 'BTCUSDT',
      t: 6774582213,
      p: '82568.01000000',
      q: '0.01210000',
      T: 1792414402539,
      m: true,
      M: true,
    });
    assertEquals(error, null);
    assertEquals(trade?.eventTime, 1792414402540);
    assertEquals(trade?.tradeTime, 1792414402539);
    assertEquals(trade?.buyerIsMaker, true);
    assertEquals((trade as Record<string, unknown>).M, true);
  });

  it('trade: rejects string ids and coerced booleans', () => {
    const base = {
      e: 'trade',
      E: 1,
      s: 'BTCUSDT',
      t: 1,
      p: '1',
      q: '1',
      T: 1,
      m: false,
    };
    assert(BinanceTradeSchemaObject.safeParse({ ...base, t: '1' })[0]);
    assert(BinanceTradeSchemaObject.safeParse({ ...base, m: 'false' })[0]);
  });

  it('bookTicker', () => {
    const [error, top] = BinanceBookTickerSchemaObject.safeParse({
      u: 1,
      s: 'BTCUSDT',
      b: '1.5',
      B: '2',
      a: '1.6',
      A: '3',
    });
    assertEquals(error, null);
    assertEquals(
      [top?.bidPrice, top?.bidQuantity, top?.askPrice, top?.askQuantity],
      [1.5, 2, 1.6, 3],
    );
  });

  it('depthUpdate: level pairs become objects; zero quantity kept', () => {
    const [error, depth] = BinanceDepthUpdateSchemaObject.safeParse({
      e: 'depthUpdate',
      E: 1,
      s: 'BTCUSDT',
      U: 10,
      u: 20,
      b: [['100.0', '0.00000000']],
      a: [['101.0', '2.5']],
    });
    assertEquals(error, null);
    assertEquals(depth?.bids, [{ price: 100, quantity: 0 }]);
    assertEquals([depth?.firstUpdateId, depth?.finalUpdateId], [10, 20]);
  });

  it('depthUpdate: rejects a malformed level', () => {
    const [error] = BinanceDepthUpdateSchemaObject.safeParse({
      e: 'depthUpdate',
      E: 1,
      s: 'BTCUSDT',
      U: 1,
      u: 2,
      b: [['x', '1']],
      a: [],
    });
    assert(error);
  });
});
