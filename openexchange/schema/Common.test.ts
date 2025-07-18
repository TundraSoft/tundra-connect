import * as asserts from '$asserts';
import {
  baseGuard,
  disclaimerGuard,
  endDateGuard,
  historicalGuard,
  licenseGuard,
  RateSchemaObject,
  startDateGuard,
  timestampGuard,
} from './Common.ts';

Deno.test('OpenExchange.schema.Common', async (t) => {
  await t.step('process individual guards correctly', () => {
    // Test individual guards - they should return the validated value
    asserts.assertEquals(
      disclaimerGuard(
        'Usage subject to terms: https://openexchangerates.org/terms',
      ),
      'Usage subject to terms: https://openexchangerates.org/terms',
    );
    asserts.assertEquals(
      licenseGuard('https://openexchangerates.org/license'),
      'https://openexchangerates.org/license',
    );
    asserts.assertEquals(timestampGuard(1703971200), 1703971200);
    asserts.assertEquals(baseGuard('USD'), 'USD');
    asserts.assertEquals(startDateGuard('2023-12-01'), '2023-12-01');
    asserts.assertEquals(endDateGuard('2023-12-03'), '2023-12-03');
    asserts.assertEquals(historicalGuard(true), true);
    asserts.assertEquals(historicalGuard(false), false);
  });

  await t.step('process currency rates correctly', () => {
    const result1 = RateSchemaObject({
      'USD': 1.0,
      'EUR': 0.9023,
      'GBP': 0.7865,
      'JPY': 148.32,
      'AUD': 1.4721,
      'CAD': 1.3245,
      'CHF': 0.8654,
      'CNY': 7.1234,
      'SEK': 10.4567,
      'NZD': 1.5432,
    });
    asserts.assert(result1);

    const result2 = RateSchemaObject({
      'BTC': 43250.75,
      'ETH': 2456.82,
    });
    asserts.assert(result2);

    const result3 = RateSchemaObject({}); // Empty rates object should be valid
    asserts.assert(result3);
  });

  await t.step('invalid individual guards', () => {
    // Test invalid disclaimer (too short)
    asserts.assertThrows(() => disclaimerGuard('Hi'));

    // Test invalid license (too short)
    asserts.assertThrows(() => licenseGuard('No'));

    // Test invalid timestamp (negative)
    asserts.assertThrows(() => timestampGuard(-1));

    // Test invalid timestamp (string that can't be coerced)
    asserts.assertThrows(() => timestampGuard('1703971200h'));

    // Test invalid base currency (too short)
    asserts.assertThrows(() => baseGuard('US'));

    // Test invalid base currency (too long)
    asserts.assertThrows(() => baseGuard('USDX'));

    // Test invalid historical field (string that can't be coerced)
    asserts.assertThrows(() => historicalGuard('trued'));
  });

  await t.step('invalid currency rates schema', () => {
    // Test invalid currency code length - should throw
    asserts.assertThrows(() =>
      RateSchemaObject({
        'US': 1.0, // too short
      })
    );

    asserts.assertThrows(() =>
      RateSchemaObject({
        'USDX': 1.0, // too long
      })
    );

    // Test invalid rate values - should throw
    asserts.assertThrows(() =>
      RateSchemaObject({
        'USD': -1.0, // negative
      })
    );

    asserts.assertThrows(() =>
      RateSchemaObject({
        'USD': 0, // zero (not positive)
      })
    );

    asserts.assertThrows(() =>
      RateSchemaObject({
        'USD': 'fgh', // string instead of number
      })
    );

    // Test invalid structure
    asserts.assertThrows(() => RateSchemaObject('invalid'));
  });
});
