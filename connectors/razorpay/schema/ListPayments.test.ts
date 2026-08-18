import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ListPaymentsRequestSchemaObject,
  ListPaymentsResponseSchemaObject,
} from './ListPayments.ts';

const validPayment = {
  id: 'pay_29QQoUBi66xm2f',
  entity: 'payment',
  amount: 29900,
  currency: 'INR',
  status: 'captured',
  order_id: null,
  invoice_id: null,
  international: false,
  method: 'card',
  amount_refunded: 0,
  refund_status: null,
  captured: true,
  description: null,
  email: 'gaurav.kumar@example.com',
  contact: '+919876543210',
  notes: {},
  fee: 590,
  tax: 90,
  error_code: null,
  error_description: null,
  error_source: null,
  error_step: null,
  error_reason: null,
  created_at: 1582637108,
};

describe('Razorpay.schema.ListPayments', () => {
  describe('ListPaymentsRequestSchemaObject', () => {
    it('accepts an empty request', () => {
      asserts.assertEquals(
        ListPaymentsRequestSchemaObject.safeParse({})[0],
        null,
      );
    });

    it('accepts count and skip', () => {
      const [error, parsed] = ListPaymentsRequestSchemaObject.safeParse({
        count: 20,
        skip: 10,
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(parsed?.count, 20);
      asserts.assertEquals(parsed?.skip, 10);
    });

    it('accepts count at the 100 maximum', () => {
      asserts.assertEquals(
        ListPaymentsRequestSchemaObject.safeParse({ count: 100 })[0],
        null,
      );
    });

    it('rejects a count above 100', () => {
      asserts.assertExists(
        ListPaymentsRequestSchemaObject.safeParse({ count: 101 })[0],
      );
    });

    it('rejects a count below 1', () => {
      asserts.assertExists(
        ListPaymentsRequestSchemaObject.safeParse({ count: 0 })[0],
      );
    });

    it('rejects a negative skip', () => {
      asserts.assertExists(
        ListPaymentsRequestSchemaObject.safeParse({ skip: -1 })[0],
      );
    });
  });

  describe('ListPaymentsResponseSchemaObject', () => {
    it('parses a valid collection response', () => {
      const [error, page] = ListPaymentsResponseSchemaObject.safeParse({
        entity: 'collection',
        count: 1,
        items: [validPayment],
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(page?.count, 1);
      asserts.assertEquals(page?.items[0]?.id, validPayment.id);
    });

    it('accepts an empty page', () => {
      const [error, page] = ListPaymentsResponseSchemaObject.safeParse({
        entity: 'collection',
        count: 0,
        items: [],
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(page?.items.length, 0);
    });

    it('rejects a response with the wrong entity discriminator', () => {
      asserts.assertExists(
        ListPaymentsResponseSchemaObject.safeParse({
          entity: 'list',
          count: 0,
          items: [],
        })[0],
      );
    });

    it('rejects a response whose items array contains an invalid payment', () => {
      asserts.assertExists(
        ListPaymentsResponseSchemaObject.safeParse({
          entity: 'collection',
          count: 1,
          items: [{ id: 'pay_missingFields' }],
        })[0],
      );
    });
  });
});
