import * as asserts from '$asserts';
import { ConvertRequestSchemaObject } from './Convert.ts';

Deno.test('OpenExchange.schema.Convert', async (t) => {
  await t.step('process convert response correctly', () => {
    asserts.assert(ConvertRequestSchemaObject({
      query: {
        from: 'USD',
        to: 'EUR',
        amount: 100,
      },
      info: {
        rate: 0.9023,
      },
      result: 90.23,
    }));

    asserts.assert(ConvertRequestSchemaObject({
      query: {
        from: 'GBP',
        to: 'JPY',
        amount: 50.5,
      },
      info: {
        rate: 188.65,
      },
      historical: true,
      date: '2023-12-01',
      result: 9526.825,
    }));

    asserts.assert(ConvertRequestSchemaObject({
      query: {
        from: 'EUR',
        to: 'USD',
        amount: 0,
      },
      info: {
        rate: 1.1082,
      },
      result: 0,
    }));
  });

  await t.step('invalid convert schema', () => {
    // Missing required fields in query
    asserts.assertThrows(() =>
      ConvertRequestSchemaObject({
        query: {
          from: 'USD',
          // missing to
          amount: 100,
        },
        info: {
          rate: 0.9023,
        },
        result: 90.23,
      })
    );

    // Invalid amount (negative)
    asserts.assertThrows(() =>
      ConvertRequestSchemaObject({
        query: {
          from: 'USD',
          to: 'EUR',
          amount: -100,
        },
        info: {
          rate: 0.9023,
        },
        result: 90.23,
      })
    );

    // Invalid rate (negative)
    asserts.assertThrows(() =>
      ConvertRequestSchemaObject({
        query: {
          from: 'USD',
          to: 'EUR',
          amount: 100,
        },
        info: {
          rate: -0.9023,
        },
        result: 90.23,
      })
    );

    // Invalid result (negative)
    asserts.assertThrows(() =>
      ConvertRequestSchemaObject({
        query: {
          from: 'USD',
          to: 'EUR',
          amount: 100,
        },
        info: {
          rate: 0.9023,
        },
        result: -90.23,
      })
    );

    // Missing required fields
    asserts.assertThrows(() =>
      ConvertRequestSchemaObject({
        query: {
          from: 'USD',
          to: 'EUR',
          amount: 100,
        },
        info: {
          rate: 0.9023,
        },
        // missing result
      })
    );

    // Invalid query structure (not an object)
    asserts.assertThrows(() =>
      ConvertRequestSchemaObject({
        query: 'invalid',
        info: {
          rate: 0.9023,
        },
        result: 90.23,
      })
    );
  });
});
