import * as asserts from '@asserts';
import { describe, it } from '@test';
import { TimeSeriesSchemaObject } from './TimeSeries.ts';

describe('OpenExchange.schema.TimeSeries', () => {
  it('accepts time-series rate responses', () => {
    asserts.assertEquals(
      TimeSeriesSchemaObject.safeParse({
        start_date: '2023-12-01',
        end_date: '2023-12-03',
        base: 'USD',
        rates: { '2023-12-01': { EUR: 0.8945 } },
      })[0],
      null,
    );
  });

  it('rejects invalid time-series fields', () => {
    asserts.assertExists(
      TimeSeriesSchemaObject.safeParse({
        start_date: 20231201,
        end_date: '2023-12-03',
        base: 'USD',
        rates: 'invalid',
      })[0],
    );
  });
});
