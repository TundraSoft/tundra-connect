import * as asserts from '$asserts';
import { LatestRatesSchemaObject } from './LatestRates.ts';

Deno.test('OpenExchange.schema.LatestRates', async (t) => {
  await t.step('process latest rates response correctly', () => {
    asserts.assert(LatestRatesSchemaObject({
      disclaimer: 'Usage subject to terms: https://openexchangerates.org/terms',
      license: 'https://openexchangerates.org/license',
      timestamp: 1703971200,
      base: 'USD',
      rates: {
        'EUR': 0.9023,
        'GBP': 0.7865,
        'JPY': 148.32,
        'AUD': 1.4721,
        'CAD': 1.3245,
        'CHF': 0.8654,
        'CNY': 7.1234,
        'SEK': 10.4567,
        'NZD': 1.5432,
      },
    }));

    asserts.assert(LatestRatesSchemaObject({
      disclaimer: 'Usage subject to terms: https://openexchangerates.org/terms',
      license: 'https://openexchangerates.org/license',
      timestamp: 1703971200,
      base: 'EUR',
      rates: {
        'USD': 1.1082,
        'GBP': 0.8712,
      },
    }));

    // Test with minimal data (only rates required)
    asserts.assert(LatestRatesSchemaObject({
      rates: {
        'USD': 1.0,
        'EUR': 0.9023,
      },
    }));
  });

  await t.step('invalid latest rates schema', () => {
    // Missing required rates field
    asserts.assertThrows(() =>
      LatestRatesSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        timestamp: 1703971200,
        base: 'USD',
        // missing rates field
      })
    );

    // Invalid timestamp (negative)
    asserts.assertThrows(() =>
      LatestRatesSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        timestamp: -1,
        base: 'USD',
        rates: { 'EUR': 0.9023 },
      })
    );

    // Invalid rates (currency code too short)
    asserts.assertThrows(() =>
      LatestRatesSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        timestamp: 1703971200,
        base: 'USD',
        rates: { 'EU': 0.9023 },
      })
    );

    // Invalid rates (negative rate)
    asserts.assertThrows(() =>
      LatestRatesSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        timestamp: 1703971200,
        base: 'USD',
        rates: { 'EUR': -0.9023 },
      })
    );

    // Invalid rates (zero rate)
    asserts.assertThrows(() =>
      LatestRatesSchemaObject({
        disclaimer:
          'Usage subject to terms: https://openexchangerates.org/terms',
        license: 'https://openexchangerates.org/license',
        timestamp: 1703971200,
        base: 'USD',
        rates: { 'EUR': 0 },
      })
    );
  });
});
