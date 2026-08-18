import * as asserts from '@asserts';
import { describe, it } from '@test';
import { RefundRequestSchemaObject, RefundSchemaObject } from './Refund.ts';

describe('PayPal.schema.Refund', () => {
  describe('RefundRequestSchemaObject', () => {
    it('accepts an empty request (full refund)', () => {
      const [error, request] = RefundRequestSchemaObject.safeParse({});
      asserts.assertEquals(error, null);
      asserts.assertEquals(request?.amount, undefined);
    });

    it('accepts a partial-refund request with amount and note_to_payer', () => {
      const [error, request] = RefundRequestSchemaObject.safeParse({
        amount: { currency_code: 'USD', value: '5.00' },
        note_to_payer: 'Partial refund for damaged item',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(request?.amount?.value, '5.00');
    });

    it('rejects a malformed amount', () => {
      asserts.assertExists(
        RefundRequestSchemaObject.safeParse({
          amount: { currency_code: 'USD', value: 'five dollars' },
        })[0],
      );
    });
  });

  describe('RefundSchemaObject', () => {
    it('accepts a documented refund response', () => {
      const [error, refund] = RefundSchemaObject.safeParse({
        id: '1JU08902RREE',
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '10.00' },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(refund?.status, 'COMPLETED');
    });

    it('rejects an undocumented status value', () => {
      asserts.assertExists(
        RefundSchemaObject.safeParse({
          id: '1JU08902RREE',
          status: 'REVERSED',
        })[0],
      );
    });

    it('rejects a response missing required fields', () => {
      asserts.assertExists(
        RefundSchemaObject.safeParse({ status: 'COMPLETED' })[0],
      );
    });
  });
});
