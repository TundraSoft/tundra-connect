import * as asserts from '$asserts';
import { CurrenciesSchemaObject } from './Currencies.ts';

Deno.test('OpenExchange.schema.Currencies', async (t) => {
  await t.step('process currencies response correctly', () => {
    asserts.assert(CurrenciesSchemaObject({
      'USD': 'United States Dollar',
      'EUR': 'Euro',
      'GBP': 'British Pound Sterling',
      'JPY': 'Japanese Yen',
      'AUD': 'Australian Dollar',
      'CAD': 'Canadian Dollar',
      'CHF': 'Swiss Franc',
      'CNY': 'Chinese Yuan',
      'SEK': 'Swedish Krona',
      'NZD': 'New Zealand Dollar',
    }));

    asserts.assert(CurrenciesSchemaObject({
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum',
    }));

    asserts.assert(CurrenciesSchemaObject({})); // Empty object should be valid
  });

  await t.step('invalid currencies schema', () => {
    // Invalid structure (not an object)
    asserts.assertThrows(() =>
      CurrenciesSchemaObject([
        { 'USD': 'United States Dollar' },
      ])
    );

    // Invalid structure (string instead of object)
    asserts.assertThrows(() => CurrenciesSchemaObject('invalid'));

    // Invalid structure (null)
    asserts.assertThrows(() => CurrenciesSchemaObject(null));
  });
});
