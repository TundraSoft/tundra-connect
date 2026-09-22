import * as asserts from '@asserts';
import { describe, it } from '@test';
import { TradeSchemaObject, TradesPageSchemaObject } from './Trade.ts';

describe('Trade schema', () => {
  it('parses a trade and coerces fixed-point strings to numbers', () => {
    const trade = TradeSchemaObject.parse({
      trade_id: 't1',
      ticker: 'KXBTCD-26JUL1515-T71799.99',
      count_fp: '5.00',
      yes_price_dollars: '0.42',
      no_price_dollars: '0.58',
      taker_outcome_side: 'yes',
      taker_book_side: 'bid',
      is_block_trade: false,
    });
    asserts.assertEquals(trade.tradeId, 't1');
    asserts.assertEquals(trade.count, 5);
    asserts.assertEquals(trade.yesPrice, 0.42);
    asserts.assertEquals(trade.noPrice, 0.58);
  });

  it('parses a trades page with a cursor', () => {
    const page = TradesPageSchemaObject.parse({
      cursor: 'abc',
      trades: [{
        trade_id: 't1',
        ticker: 'T',
        count_fp: '1.00',
        yes_price_dollars: '0.5',
        no_price_dollars: '0.5',
      }],
    });
    asserts.assertEquals(page.trades.length, 1);
    asserts.assertEquals(page.cursor, 'abc');
  });

  it('defaults an absent trades array to empty', () => {
    const page = TradesPageSchemaObject.parse({});
    asserts.assertEquals(page.trades, []);
  });

  it('rejects a trade missing the required trade_id', () => {
    asserts.assertThrows(() =>
      TradeSchemaObject.parse({
        ticker: 'T',
        count_fp: '1.00',
        yes_price_dollars: '0.5',
        no_price_dollars: '0.5',
      })
    );
  });

  it('rejects a null count rather than silently coercing it to 0', () => {
    // Regression: a hand-rolled `Number(null)` used to silently produce 0
    // for this REQUIRED field, passing validation instead of correctly
    // failing on a malformed wire value.
    asserts.assertThrows(() =>
      TradeSchemaObject.parse({
        trade_id: 't1',
        ticker: 'T',
        count_fp: null,
        yes_price_dollars: '0.5',
        no_price_dollars: '0.5',
      })
    );
  });
});
