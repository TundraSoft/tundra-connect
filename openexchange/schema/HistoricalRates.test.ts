import * as asserts from '$asserts';
import { HistoricalRatesSchemaObject } from './HistoricalRates.ts';

Deno.test('OpenExchange.schema.HistoricalRates', async (t) => {
  await t.step('process historical rates response correctly', () => {
    asserts.assert(HistoricalRatesSchemaObject({
      disclaimer: 'Usage subject to terms: https://openexchangerates.org/terms',
      license: 'https://openexchangerates.org/license',
      timestamp: 1703894400,
      historical: true,
      base: 'USD',
      rates: {
        'EUR': 0.8945,
        'GBP': 0.7832,
        'JPY': 147.65,
        'AUD': 1.4589,
        'CAD': 1.3187,
      },
    }));

    asserts.assert(HistoricalRatesSchemaObject({
      disclaimer: 'Usage subject to terms: https://openexchangerates.org/terms',
      license: 'https://openexchangerates.org/license',
      timestamp: 1703808000,
      historical: true,
      base: 'EUR',
      rates: {
        'USD': 1.1178,
        'GBP': 0.8756,
        'JPY': 165.23,
      },
    }));
  });

  await t.step('invalid historical rates schema', () => {
    // Invalid historical field (not true)
    asserts.assertThrows(() =>
      HistoricalRatesSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        timestamp: 1703894400,
        historical: false,
        base: 'USD',
        rates: { 'EUR': 0.8945 },
      })
    );

    // Missing required fields
    asserts.assertThrows(() =>
      HistoricalRatesSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        // missing timestamp
        historical: true,
        base: 'USD',
        rates: { 'EUR': 0.8945 },
      })
    );

    // Invalid timestamp (negative)
    asserts.assertThrows(() =>
      HistoricalRatesSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        timestamp: -1,
        historical: true,
        base: 'USD',
        rates: { 'EUR': 0.8945 },
      })
    );

    // Invalid historical field type
    asserts.assertThrows(() =>
      HistoricalRatesSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        timestamp: 1703894400,
        historical: 123,
        base: 'USD',
        rates: { 'EUR': 0.8945 },
      })
    );
  });
});
