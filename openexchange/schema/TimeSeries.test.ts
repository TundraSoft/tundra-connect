import * as asserts from '$asserts';
import { TimeSeriesSchemaObject } from './TimeSeries.ts';

Deno.test('OpenExchange.schema.TimeSeries', async (t) => {
  await t.step('process time series response correctly', () => {
    asserts.assert(TimeSeriesSchemaObject({
      disclaimer: 'Usage subject to terms: https://openexchangerates.org/terms',
      license: 'https://openexchangerates.org/license',
      start_date: '2023-12-01',
      end_date: '2023-12-03',
      base: 'USD',
      rates: {
        '2023-12-01': {
          'EUR': 0.8945,
          'GBP': 0.7832,
          'JPY': 147.65,
        },
        '2023-12-02': {
          'EUR': 0.8967,
          'GBP': 0.7845,
          'JPY': 148.12,
        },
        '2023-12-03': {
          'EUR': 0.9023,
          'GBP': 0.7865,
          'JPY': 148.32,
        },
      },
    }));

    asserts.assert(TimeSeriesSchemaObject({
      disclaimer: 'Usage subject to terms: https://openexchangerates.org/terms',
      license: 'https://openexchangerates.org/license',
      start_date: '2023-11-15',
      end_date: '2023-11-15',
      base: 'EUR',
      rates: {
        '2023-11-15': {
          'USD': 1.0876,
          'GBP': 0.8634,
        },
      },
    }));
  });

  await t.step('invalid time series schema', () => {
    // Missing required fields
    asserts.assertThrows(() =>
      TimeSeriesSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        // missing start_date
        end_date: '2023-12-03',
        base: 'USD',
        rates: {
          '2023-12-01': { 'EUR': 0.8945 },
        },
      })
    );

    // Invalid date format (not a string)
    asserts.assertThrows(() =>
      TimeSeriesSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        start_date: 20231201,
        end_date: '2023-12-03',
        base: 'USD',
        rates: {
          '2023-12-01': { 'EUR': 0.8945 },
        },
      })
    );

    // Invalid base currency (not a string)
    asserts.assertThrows(() =>
      TimeSeriesSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        start_date: '2023-12-01',
        end_date: '2023-12-03',
        base: 123,
        rates: {
          '2023-12-01': { 'EUR': 0.8945 },
        },
      })
    );

    // Invalid rates structure (not an object)
    asserts.assertThrows(() =>
      TimeSeriesSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        start_date: '2023-12-01',
        end_date: '2023-12-03',
        base: 'USD',
        rates: 'invalid',
      })
    );
  });
});
