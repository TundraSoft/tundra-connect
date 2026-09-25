import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  BalanceSchemaObject,
  EventPositionSchemaObject,
  FillSchemaObject,
  FillsPageSchemaObject,
  MarketPositionSchemaObject,
  PositionsPageSchemaObject,
} from './Portfolio.ts';

describe('Balance schema', () => {
  it('parses a balance response', () => {
    const balance = BalanceSchemaObject.parse({
      balance: 10000,
      balance_dollars: '100.0000',
      portfolio_value: 12000,
      updated_ts: 1700000000,
    });
    asserts.assertEquals(balance.balance, 10000);
    asserts.assertEquals(balance.balanceDollars, 100);
  });

  it('rejects a response missing the required balance', () => {
    asserts.assertThrows(() => BalanceSchemaObject.parse({}));
  });
});

describe('MarketPosition / EventPosition schemas', () => {
  it('parses a market position, negative for a NO-side holding', () => {
    const position = MarketPositionSchemaObject.parse({
      ticker: 'T',
      position_fp: '-2.00',
    });
    asserts.assertEquals(position.position, -2);
  });

  it('parses an event position', () => {
    const position = EventPositionSchemaObject.parse({
      event_ticker: 'E',
      event_exposure_dollars: '12.50',
    });
    asserts.assertEquals(position.eventExposure, 12.5);
  });

  it('parses a positions page, defaulting absent arrays to empty', () => {
    const page = PositionsPageSchemaObject.parse({
      market_positions: [{ ticker: 'T', position_fp: '5.00' }],
    });
    asserts.assertEquals(page.marketPositions.length, 1);
    asserts.assertEquals(page.eventPositions, []);
  });
});

describe('Fill schema', () => {
  it('parses a fill', () => {
    const fill = FillSchemaObject.parse({
      fill_id: 'f1',
      order_id: 'o1',
      count_fp: '1.00',
      is_taker: true,
    });
    asserts.assertEquals(fill.fillId, 'f1');
    asserts.assert(fill.isTaker);
  });

  it('parses a fills page with a cursor', () => {
    const page = FillsPageSchemaObject.parse({
      fills: [{ fill_id: 'f1', is_taker: true }],
      cursor: 'abc',
    });
    asserts.assertEquals(page.fills.length, 1);
    asserts.assertEquals(page.cursor, 'abc');
  });

  it('rejects a fill missing the required fill_id', () => {
    asserts.assertThrows(() => FillSchemaObject.parse({ order_id: 'o1' }));
  });
});
