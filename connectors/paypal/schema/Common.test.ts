import * as asserts from '@asserts';
import { describe, it } from '@test';
import { LinkSchemaObject, MoneySchemaObject } from './Common.ts';

describe('PayPal.schema.Common', () => {
  describe('MoneySchemaObject', () => {
    it('accepts a decimal-string value', () => {
      const [error, money] = MoneySchemaObject.safeParse({
        currency_code: 'USD',
        value: '10.00',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(money?.value, '10.00');
      asserts.assertEquals(typeof money?.value, 'string');
    });

    it('accepts an integer-string value for a zero-decimal currency', () => {
      const [error, money] = MoneySchemaObject.safeParse({
        currency_code: 'JPY',
        value: '100',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(money?.value, '100');
    });

    it('accepts a negative value (e.g. a discount line)', () => {
      const [error, money] = MoneySchemaObject.safeParse({
        currency_code: 'USD',
        value: '-5.00',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(money?.value, '-5.00');
    });

    it('rejects a non-string value that cannot be coerced (object/array)', () => {
      // Guardian's StringGuardian coerces primitives (number/bigint/boolean)
      // to their string form, so a bare `value: 10` would legally coerce to
      // `"10"` and pass — objects/arrays are the values it actually rejects
      // outright.
      asserts.assertExists(
        MoneySchemaObject.safeParse({ currency_code: 'USD', value: {} })[0],
      );
      asserts.assertExists(
        MoneySchemaObject.safeParse({ currency_code: 'USD', value: [1, 2] })[0],
      );
    });

    it('rejects a value that is not a valid decimal string', () => {
      asserts.assertExists(
        MoneySchemaObject.safeParse({ currency_code: 'USD', value: 'ten' })[0],
      );
      asserts.assertExists(
        MoneySchemaObject.safeParse({
          currency_code: 'USD',
          value: '10.00.00',
        })[0],
      );
      asserts.assertExists(
        MoneySchemaObject.safeParse({ currency_code: 'USD', value: '' })[0],
      );
    });

    it('rejects a currency_code that is not exactly 3 characters', () => {
      asserts.assertExists(
        MoneySchemaObject.safeParse({ currency_code: 'US', value: '10.00' })[0],
      );
      asserts.assertExists(
        MoneySchemaObject.safeParse({
          currency_code: 'USDD',
          value: '10.00',
        })[0],
      );
    });

    it('rejects a missing field', () => {
      asserts.assertExists(
        MoneySchemaObject.safeParse({ currency_code: 'USD' })[0],
      );
      asserts.assertExists(MoneySchemaObject.safeParse({ value: '10.00' })[0]);
    });
  });

  describe('LinkSchemaObject', () => {
    it('accepts a documented HATEOAS link', () => {
      const [error, link] = LinkSchemaObject.safeParse({
        href: 'https://api-m.sandbox.paypal.com/v2/checkout/orders/5O19',
        rel: 'self',
        method: 'GET',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(link?.rel, 'self');
    });

    it('accepts a link with no method', () => {
      const [error, link] = LinkSchemaObject.safeParse({
        href: 'https://example.com',
        rel: 'self',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(link?.method, undefined);
    });

    it('rejects an unsupported HTTP method value', () => {
      asserts.assertExists(
        LinkSchemaObject.safeParse({
          href: 'https://example.com',
          rel: 'self',
          method: 'TRACE',
        })[0],
      );
    });

    it('rejects a link missing href or rel', () => {
      asserts.assertExists(LinkSchemaObject.safeParse({ rel: 'self' })[0]);
      asserts.assertExists(
        LinkSchemaObject.safeParse({ href: 'https://example.com' })[0],
      );
    });
  });
});
