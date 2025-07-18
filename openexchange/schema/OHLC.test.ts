import * as asserts from '$asserts';
import { OHLCDataSchemaObject, OHLCSchemaObject } from './OHLC.ts';

Deno.test('OpenExchange.schema.OHLC', async (t) => {
  await t.step('process OHLC response correctly', () => {
    asserts.assert(OHLCSchemaObject({
      disclaimer: 'Usage subject to terms: https://openexchangerates.org/terms',
      license: 'https://openexchangerates.org/license',
      start_date: '2023-12-01',
      end_date: '2023-12-03',
      base: 'USD',
      rates: {
        '2023-12-01': {
          'EUR': {
            open: 0.8932,
            high: 0.8967,
            low: 0.8901,
            close: 0.8945,
            average: 0.8936,
          },
          'GBP': {
            open: 0.7821,
            high: 0.7845,
            low: 0.7812,
            close: 0.7832,
            average: 0.7828,
          },
        },
        '2023-12-02': {
          'EUR': {
            open: 0.8945,
            high: 0.8989,
            low: 0.8923,
            close: 0.8967,
            average: 0.8956,
          },
        },
      },
    }));
  });

  await t.step('process OHLC data object correctly', () => {
    asserts.assert(OHLCDataSchemaObject({
      open: 0.8932,
      high: 0.8967,
      low: 0.8901,
      close: 0.8945,
      average: 0.8936,
    }));

    asserts.assert(OHLCDataSchemaObject({
      open: 1.2345,
      high: 1.2567,
      low: 1.2234,
      close: 1.2456,
      average: 1.2401,
    }));
  });

  await t.step('invalid OHLC schema', () => {
    // Missing required fields
    asserts.assertThrows(() =>
      OHLCSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        // missing start_date
        end_date: '2023-12-03',
        base: 'USD',
        rates: {},
      })
    );

    // Invalid date format (not a string)
    asserts.assertThrows(() =>
      OHLCSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        start_date: 20231201,
        end_date: '2023-12-03',
        base: 'USD',
        rates: {},
      })
    );

    // Invalid base currency (not a string)
    asserts.assertThrows(() =>
      OHLCSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        start_date: '2023-12-01',
        end_date: '2023-12-03',
        base: 123,
        rates: {},
      })
    );
  });

  await t.step('invalid OHLC data schema', () => {
    // Missing required fields
    asserts.assertThrows(() =>
      OHLCDataSchemaObject({
        open: 0.8932,
        high: 0.8967,
        low: 0.8901,
        // missing close
        average: 0.8936,
      })
    );

    // Invalid negative values
    asserts.assertThrows(() =>
      OHLCDataSchemaObject({
        open: -0.8932,
        high: 0.8967,
        low: 0.8901,
        close: 0.8945,
        average: 0.8936,
      })
    );
  });
});
