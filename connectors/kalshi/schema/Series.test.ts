import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  SeriesListResponseSchemaObject,
  SeriesSchemaObject,
  SingleSeriesSchemaObject,
} from './Series.ts';

describe('Series schema', () => {
  it('parses a series', () => {
    const series = SeriesSchemaObject.parse({
      ticker: 'KXBTCD',
      title: 'Bitcoin price',
      fee_type: 'quadratic',
      fee_multiplier: 1,
      volume_fp: '5000.00',
    });
    asserts.assertEquals(series.ticker, 'KXBTCD');
    asserts.assertEquals(series.volume, 5000);
  });

  it('parses a series list and unwraps a single series envelope', () => {
    const list = SeriesListResponseSchemaObject.parse({
      series: [{ ticker: 'KXBTCD', title: 'Bitcoin price' }],
    });
    asserts.assertEquals(list.series.length, 1);
    const single = SingleSeriesSchemaObject.parse({
      series: { ticker: 'KXBTCD', title: 'Bitcoin price' },
    });
    asserts.assertEquals(single.ticker, 'KXBTCD');
  });

  it('rejects a series missing the required title', () => {
    asserts.assertThrows(() => SeriesSchemaObject.parse({ ticker: 'KXBTCD' }));
  });
});
