import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CreateSubscriptionRequestSchemaObject,
  CreateSubscriptionResponseSchemaObject,
} from './CreateSubscription.ts';

const base = {
  product_id: 'prd_monthly',
  quantity: 1,
  customer: { email: 'a@example.com', name: 'Ada' },
  billing: { country: 'US' },
};

describe('DodoPayments.schema.CreateSubscriptionRequest', () => {
  it('accepts a minimal request', () => {
    asserts.assertEquals(
      CreateSubscriptionRequestSchemaObject.safeParse(base)[0],
      null,
    );
  });

  it('accepts a trial and hosted checkout', () => {
    const [error, body] = CreateSubscriptionRequestSchemaObject.safeParse({
      ...base,
      trial_period_days: 14,
      payment_link: true,
      return_url: 'https://example.com/welcome',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.trial_period_days, 14);
  });

  it('rejects a zero quantity — a subscription must cover at least one unit', () => {
    asserts.assertExists(
      CreateSubscriptionRequestSchemaObject.safeParse({
        ...base,
        quantity: 0,
      })[0],
    );
  });

  it('rejects a fractional quantity', () => {
    asserts.assertExists(
      CreateSubscriptionRequestSchemaObject.safeParse({
        ...base,
        quantity: 1.5,
      })[0],
    );
  });

  it('rejects a blank product id', () => {
    asserts.assertExists(
      CreateSubscriptionRequestSchemaObject.safeParse({
        ...base,
        product_id: '',
      })[0],
    );
  });

  it('rejects a customer that is neither an id nor an email', () => {
    asserts.assertExists(
      CreateSubscriptionRequestSchemaObject.safeParse({
        ...base,
        customer: { name: 'Ada' },
      })[0],
    );
  });
});

describe('DodoPayments.schema.CreateSubscriptionResponse', () => {
  const created = {
    subscription_id: 'sub_1',
    payment_id: 'pay_1',
    customer: { customer_id: 'cus_1', email: 'a@example.com', name: 'Ada' },
    recurring_pre_tax_amount: 1000,
    payment_method_required: true,
    metadata: {},
  };

  it('accepts a created subscription awaiting payment', () => {
    const [error, body] = CreateSubscriptionResponseSchemaObject.safeParse({
      ...created,
      payment_link: 'https://checkout.dodopayments.com/sub_1',
    });
    asserts.assertEquals(error, null);
    // Created is NOT active — the customer still has to pay.
    asserts.assertEquals(body?.payment_method_required, true);
    asserts.assertExists(body?.payment_link);
  });

  it('accepts a subscription that needs no further payment step', () => {
    const [error, body] = CreateSubscriptionResponseSchemaObject.safeParse({
      ...created,
      payment_method_required: false,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.payment_method_required, false);
  });

  it('rejects a response missing the first payment id', () => {
    const { payment_id: _p, ...noPayment } = created;
    asserts.assertExists(
      CreateSubscriptionResponseSchemaObject.safeParse(noPayment)[0],
    );
  });
});
