import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ConvertRequestSchemaObject } from './Convert.ts';

describe('OpenExchange.schema.Convert', () => {
  it('accepts a documented conversion response', () => {
    asserts.assertEquals(
      ConvertRequestSchemaObject.safeParse({
        request: {
          query: '100.0 USD => EUR',
          amount: 100,
          from: 'USD',
          to: 'EUR',
        },
        meta: { timestamp: 1640995200, rate: 0.9023 },
        response: 90.23,
      })[0],
      null,
    );
  });

  it('rejects an incomplete conversion response', () => {
    asserts.assertExists(
      ConvertRequestSchemaObject.safeParse({
        request: { query: '100.0 USD => ?', amount: -100, from: 'USD' },
        meta: { timestamp: 1640995200, rate: -0.9023 },
      })[0],
    );
  });
});
