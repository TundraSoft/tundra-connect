import { describe, it } from '@test';
import { assert, assertEquals } from '@asserts';
import {
  KalshiFeedFillSchemaObject,
  KalshiFeedMarketPositionSchemaObject,
  KalshiFeedTickerSchemaObject,
  KalshiFeedTradeSchemaObject,
  KalshiFeedUserOrderSchemaObject,
  KalshiOrderbookDeltaSchemaObject,
  KalshiOrderbookSnapshotSchemaObject,
} from './Feed.ts';

describe('Kalshi feed schemas', () => {
  it('orderbook snapshot: pairs become levels, missing side becomes []', () => {
    const [error, book] = KalshiOrderbookSnapshotSchemaObject.safeParse({
      market_ticker: 'FED-23DEC-T3.00',
      market_id: 'u',
      no_dollars_fp: [['0.5400', '20.00']],
    });
    assertEquals(error, null);
    assertEquals(book?.yes, []);
    assertEquals(book?.no, [{ price: 0.54, count: 20 }]);
  });

  it('orderbook snapshot: rejects a malformed level', () => {
    const [error] = KalshiOrderbookSnapshotSchemaObject.safeParse({
      market_ticker: 'M',
      yes_dollars_fp: [['x', '1']],
    });
    assert(error);
  });

  it('orderbook delta: signed fixed-point delta, keeps unknown keys', () => {
    const [error, delta] = KalshiOrderbookDeltaSchemaObject.safeParse({
      market_ticker: 'M',
      price_dollars: '0.9600',
      delta_fp: '-54.00',
      side: 'yes',
      ts: '2022-11-22T20:44:01Z',
      ts_ms: 1669149841000,
    });
    assertEquals(error, null);
    assertEquals([delta?.price, delta?.delta, delta?.tsMs], [
      0.96,
      -54,
      1669149841000,
    ]);
    assertEquals((delta as Record<string, unknown>).ts, '2022-11-22T20:44:01Z');
  });

  it('orderbook delta: rejects an unknown side', () => {
    const [error] = KalshiOrderbookDeltaSchemaObject.safeParse({
      market_ticker: 'M',
      price_dollars: '0.96',
      delta_fp: '1',
      side: 'maybe',
    });
    assert(error);
  });

  it('trade, ticker, fill, order, position', () => {
    assertEquals(
      KalshiFeedTradeSchemaObject.safeParse({
        trade_id: 't',
        market_ticker: 'M',
        yes_price_dollars: '0.36',
        no_price_dollars: '0.64',
        count_fp: '136.00',
      })[1]?.count,
      136,
    );
    assertEquals(
      KalshiFeedTickerSchemaObject.safeParse({
        market_ticker: 'M',
        price_dollars: '0.48',
        yes_bid_dollars: '0.47',
        yes_ask_dollars: '0.49',
        open_interest_fp: '12.00',
      })[1]?.openInterest,
      12,
    );
    const [fillError] = KalshiFeedFillSchemaObject.safeParse({
      trade_id: 't',
      order_id: 'o',
      market_ticker: 'M',
      is_taker: 'true',
      side: 'yes',
      yes_price_dollars: '0.35',
      count_fp: '3',
    });
    assert(fillError, 'is_taker must be a real boolean');
    const [orderError, order] = KalshiFeedUserOrderSchemaObject.safeParse({
      order_id: 'o',
      ticker: 'M',
      status: 'executed',
      side: 'no',
      yes_price_dollars: '0.35',
      taker_fees_dollars: '0.010000',
      created_ts_ms: null,
    });
    assertEquals(orderError, null);
    assertEquals(order?.takerFees, 0.01);
    assertEquals(
      KalshiFeedMarketPositionSchemaObject.safeParse({
        market_ticker: 'M',
        position_fp: '-2.00',
      })[1]?.position,
      -2,
    );
  });
});
