import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CreatePaymentRequestSchemaObject,
  CreatePaymentResponseSchemaObject,
  ProductCartItemSchemaObject,
} from './CreatePayment.ts';

const base = {
  product_cart: [{ product_id: 'prd_1', quantity: 1 }],
  customer: { email: 'a@example.com', name: 'Ada' },
  billing: { country: 'US' },
};

describe('DodoPayments.schema.ProductCartItem', () => {
  it('accepts a product line', () => {
    asserts.assertEquals(
      ProductCartItemSchemaObject.safeParse({
        product_id: 'prd_1',
        quantity: 2,
      })[0],
      null,
    );
  });

  it('accepts an explicit amount override', () => {
    asserts.assertEquals(
      ProductCartItemSchemaObject.safeParse({
        product_id: 'prd_1',
        quantity: 1,
        amount: 500,
      })[0],
      null,
    );
  });

  it('rejects a negative quantity', () => {
    asserts.assertExists(
      ProductCartItemSchemaObject.safeParse({
        product_id: 'prd_1',
        quantity: -1,
      })[0],
    );
  });

  it('rejects a fractional quantity', () => {
    asserts.assertExists(
      ProductCartItemSchemaObject.safeParse({
        product_id: 'prd_1',
        quantity: 1.5,
      })[0],
    );
  });

  it('rejects a blank product id', () => {
    asserts.assertExists(
      ProductCartItemSchemaObject.safeParse({ product_id: '', quantity: 1 })[0],
    );
  });
});

describe('DodoPayments.schema.CreatePaymentRequest', () => {
  it('accepts a minimal request', () => {
    asserts.assertEquals(
      CreatePaymentRequestSchemaObject.safeParse(base)[0],
      null,
    );
  });

  it('accepts an existing customer by id', () => {
    asserts.assertEquals(
      CreatePaymentRequestSchemaObject.safeParse({
        ...base,
        customer: { customer_id: 'cus_1' },
      })[0],
      null,
    );
  });

  it('accepts the hosted-checkout options', () => {
    const [error, body] = CreatePaymentRequestSchemaObject.safeParse({
      ...base,
      payment_link: true,
      return_url: 'https://example.com/thanks',
      metadata: { order_id: '42' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.payment_link, true);
    asserts.assertEquals(body?.metadata?.order_id, '42');
  });

  it('rejects an empty product cart', () => {
    asserts.assertExists(
      CreatePaymentRequestSchemaObject.safeParse({
        ...base,
        product_cart: [],
      })[0],
    );
  });

  it('rejects more than 20 discount codes', () => {
    asserts.assertExists(
      CreatePaymentRequestSchemaObject.safeParse({
        ...base,
        discount_codes: Array.from({ length: 21 }, (_, i) => `D${i}`),
      })[0],
    );
  });

  it('rejects a missing billing country', () => {
    asserts.assertExists(
      CreatePaymentRequestSchemaObject.safeParse({ ...base, billing: {} })[0],
    );
  });
});

describe('DodoPayments.schema.CreatePaymentResponse', () => {
  const created = {
    payment_id: 'pay_1',
    total_amount: 1999,
    client_secret: 'cs_test_x',
    customer: { customer_id: 'cus_1', email: 'a@example.com', name: 'Ada' },
    metadata: {},
  };

  it('accepts a created payment', () => {
    const [error, body] = CreatePaymentResponseSchemaObject.safeParse(created);
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.payment_id, 'pay_1');
  });

  it('accepts a hosted checkout link', () => {
    const [error, body] = CreatePaymentResponseSchemaObject.safeParse({
      ...created,
      payment_link: 'https://checkout.dodopayments.com/pay_1',
      expires_on: '2026-01-02T00:00:00Z',
    });
    asserts.assertEquals(error, null);
    asserts.assertExists(body?.payment_link);
  });

  it('rejects a response missing the client secret', () => {
    const { client_secret: _cs, ...noSecret } = created;
    asserts.assertExists(
      CreatePaymentResponseSchemaObject.safeParse(noSecret)[0],
    );
  });
});
