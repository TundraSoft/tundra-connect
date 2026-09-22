import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  PaymentListItemSchemaObject,
  PaymentListSchemaObject,
  PaymentSchemaObject,
} from './Payment.ts';

const CUSTOMER = {
  customer_id: 'cus_1',
  email: 'a@example.com',
  name: 'Ada',
};

const PAYMENT = {
  payment_id: 'pay_1',
  business_id: 'biz_1',
  brand_id: 'brd_1',
  total_amount: 1999,
  currency: 'USD',
  customer: CUSTOMER,
  billing: { country: 'US' },
  created_at: '2026-01-01T00:00:00Z',
  digital_products_delivered: true,
  metadata: {},
  status: 'succeeded',
};

const LIST_ITEM = {
  payment_id: 'pay_1',
  brand_id: 'brd_1',
  total_amount: 1999,
  currency: 'USD',
  customer: CUSTOMER,
  created_at: '2026-01-01T00:00:00Z',
  digital_products_delivered: true,
  metadata: {},
};

describe('DodoPayments.schema.Payment', () => {
  it('accepts a minimal succeeded payment', () => {
    const [error, payment] = PaymentSchemaObject.safeParse(PAYMENT);
    asserts.assertEquals(error, null);
    asserts.assertEquals(payment?.status, 'succeeded');
    // Amounts are the currency's smallest unit — 1999 is $19.99.
    asserts.assertEquals(payment?.total_amount, 1999);
  });

  it('accepts a failed payment carrying error details', () => {
    const [error, payment] = PaymentSchemaObject.safeParse({
      ...PAYMENT,
      status: 'failed',
      error_code: 'card_declined',
      error_message: 'The card was declined.',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(payment?.error_code, 'card_declined');
  });

  it('accepts an absent status — never assume it is set', () => {
    const { status: _s, ...noStatus } = PAYMENT;
    asserts.assertEquals(PaymentSchemaObject.safeParse(noStatus)[0], null);
  });

  it('accepts a null status', () => {
    asserts.assertEquals(
      PaymentSchemaObject.safeParse({ ...PAYMENT, status: null })[0],
      null,
    );
  });

  it('keeps additive vendor fields rather than rejecting them', () => {
    const [error, payment] = PaymentSchemaObject.safeParse({
      ...PAYMENT,
      refunds: [],
      disputes: [],
      settlement_amount: 1899,
      brand_new_field: true,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      (payment as Record<string, unknown>).brand_new_field,
      true,
    );
  });

  it('rejects an undocumented status value', () => {
    asserts.assertExists(
      PaymentSchemaObject.safeParse({ ...PAYMENT, status: 'paid' })[0],
    );
  });

  it('rejects a payment missing its id', () => {
    const { payment_id: _id, ...noId } = PAYMENT;
    asserts.assertExists(PaymentSchemaObject.safeParse(noId)[0]);
  });

  it('rejects a non-object payment', () => {
    asserts.assertExists(PaymentSchemaObject.safeParse('pay_1')[0]);
  });
});

describe('DodoPayments.schema.PaymentListItem', () => {
  it('accepts a list item without the heavy detail-only fields', () => {
    asserts.assertEquals(
      PaymentListItemSchemaObject.safeParse(LIST_ITEM)[0],
      null,
    );
  });

  it('rejects a list item missing its customer', () => {
    const { customer: _c, ...noCustomer } = LIST_ITEM;
    asserts.assertExists(PaymentListItemSchemaObject.safeParse(noCustomer)[0]);
  });
});

describe('DodoPayments.schema.PaymentList', () => {
  it('accepts a populated page', () => {
    const [error, page] = PaymentListSchemaObject.safeParse({
      items: [LIST_ITEM],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.items.length, 1);
  });

  it('accepts an explicitly empty page', () => {
    const [error, page] = PaymentListSchemaObject.safeParse({ items: [] });
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.items, []);
  });

  it('normalizes an absent items array to empty — "no payments" is an answer', () => {
    const [error, page] = PaymentListSchemaObject.safeParse({});
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.items, []);
  });

  it('rejects a page whose items are not payments', () => {
    asserts.assertExists(
      PaymentListSchemaObject.safeParse({ items: ['pay_1'] })[0],
    );
  });

  it('treats a bare array body as the items themselves', () => {
    // Defensive: if the vendor ever returns a naked array, the results
    // must not be silently dropped in favour of an empty page.
    const [error, page] = PaymentListSchemaObject.safeParse([LIST_ITEM]);
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.items.length, 1);
  });

  it('rejects a scalar body', () => {
    asserts.assertExists(PaymentListSchemaObject.safeParse('pay_1')[0]);
    asserts.assertExists(PaymentListSchemaObject.safeParse(42)[0]);
  });
});
