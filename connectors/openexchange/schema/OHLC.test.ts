import * as asserts from '@asserts';
import { describe, it } from '@test';
import { OHLCDataSchemaObject, OHLCSchemaObject } from './OHLC.ts';

describe('OpenExchange.schema.OHLC', () => {
  it('accepts OHLC responses', () => {
    asserts.assertEquals(
      OHLCSchemaObject.safeParse({
        start_date: '2023-12-01',
        end_date: '2023-12-03',
        rates: {
          '2023-12-01': {
            EUR: { open: 1, high: 2, low: 0.5, close: 1.5, average: 1.25 },
          },
        },
      })[0],
      null,
    );
  });

  it('rejects incomplete OHLC values', () => {
    asserts.assertExists(OHLCDataSchemaObject.safeParse({ open: -1 })[0]);
  });
});
