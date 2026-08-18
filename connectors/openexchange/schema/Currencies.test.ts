import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CurrenciesSchemaObject } from './Currencies.ts';

describe('OpenExchange.schema.Currencies', () => {
  it('accepts currency code mappings', () => {
    asserts.assertEquals(
      CurrenciesSchemaObject.safeParse({
        USD: 'United States Dollar',
        EUR: 'Euro',
      })[0],
      null,
    );
  });

  it('rejects non-object payloads', () => {
    asserts.assertExists(CurrenciesSchemaObject.safeParse(null)[0]);
  });
});
