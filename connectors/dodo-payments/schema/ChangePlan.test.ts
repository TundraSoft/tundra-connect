import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ChangePlanRequestSchemaObject,
  ChangePlanResponseSchemaObject,
  ProrationBillingModeSchemaObject,
} from './ChangePlan.ts';

const valid = {
  product_id: 'pdt_pro',
  quantity: 1,
  proration_billing_mode: 'prorated_immediately',
};

describe('DodoPayments.schema.ProrationBillingMode', () => {
  it('accepts every documented mode', () => {
    for (
      const mode of [
        'prorated_immediately',
        'full_immediately',
        'difference_immediately',
        'do_not_bill',
      ]
    ) {
      asserts.assertEquals(
        ProrationBillingModeSchemaObject.safeParse(mode)[0],
        null,
        mode,
      );
    }
  });

  it('rejects an unknown mode', () => {
    asserts.assertExists(
      ProrationBillingModeSchemaObject.safeParse('later')[0],
    );
  });
});

describe('DodoPayments.schema.ChangePlanRequest', () => {
  it('accepts the minimal change', () => {
    asserts.assertEquals(
      ChangePlanRequestSchemaObject.safeParse(valid)[0],
      null,
    );
  });

  it('requires product_id, quantity and proration_billing_mode', () => {
    for (const key of ['product_id', 'quantity', 'proration_billing_mode']) {
      const { [key]: _, ...rest } = valid as Record<string, unknown>;
      asserts.assertExists(
        ChangePlanRequestSchemaObject.safeParse(rest)[0],
        key,
      );
    }
  });

  it('rejects a zero quantity', () => {
    asserts.assertExists(
      ChangePlanRequestSchemaObject.safeParse({ ...valid, quantity: 0 })[0],
    );
  });

  it('accepts a change scheduled for the next billing date', () => {
    asserts.assertEquals(
      ChangePlanRequestSchemaObject.safeParse({
        ...valid,
        effective_at: 'next_billing_date',
      })[0],
      null,
    );
  });

  it('accepts collect_via_payment_link with prevent_change', () => {
    asserts.assertEquals(
      ChangePlanRequestSchemaObject.safeParse({
        ...valid,
        collect_via_payment_link: true,
        on_payment_failure: 'prevent_change',
      })[0],
      null,
    );
  });

  it('rejects collect_via_payment_link without prevent_change', () => {
    for (const on_payment_failure of [undefined, 'apply_change']) {
      asserts.assertExists(
        ChangePlanRequestSchemaObject.safeParse({
          ...valid,
          collect_via_payment_link: true,
          on_payment_failure,
        })[0],
        String(on_payment_failure),
      );
    }
  });

  it('rejects collect_via_payment_link on a scheduled change', () => {
    asserts.assertExists(
      ChangePlanRequestSchemaObject.safeParse({
        ...valid,
        collect_via_payment_link: true,
        on_payment_failure: 'prevent_change',
        effective_at: 'next_billing_date',
      })[0],
    );
  });

  it('rejects more than 20 discount codes', () => {
    asserts.assertExists(
      ChangePlanRequestSchemaObject.safeParse({
        ...valid,
        discount_codes: Array.from({ length: 21 }, (_, i) => `CODE${i}`),
      })[0],
    );
  });
});

describe('DodoPayments.schema.ChangePlanResponse', () => {
  it('accepts the all-null answer of an off-session change', () => {
    const [error, result] = ChangePlanResponseSchemaObject.safeParse({
      payment_id: null,
      payment_link: null,
      client_secret: null,
      expires_on: null,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.payment_link, null);
  });

  it('treats an empty body as an empty result', () => {
    for (const body of [null, undefined, '']) {
      const [error, result] = ChangePlanResponseSchemaObject.safeParse(body);
      asserts.assertEquals(error, null, String(body));
      asserts.assertEquals(result, {});
    }
  });

  it('surfaces the checkout link of a payment-link change', () => {
    const [, result] = ChangePlanResponseSchemaObject.safeParse({
      payment_id: 'pay_1',
      payment_link: 'https://checkout.dodopayments.com/pay_1',
    });
    asserts.assertEquals(
      result?.payment_link,
      'https://checkout.dodopayments.com/pay_1',
    );
  });
});
