import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  SubscriptionListSchemaObject,
  SubscriptionSchemaObject,
  TimeIntervalSchemaObject,
} from './Subscription.ts';

const SUB = {
  subscription_id: 'sub_1',
  product_id: 'prd_1',
  status: 'active',
  customer: { customer_id: 'cus_1', email: 'a@example.com', name: 'Ada' },
  billing: { country: 'US' },
  quantity: 1,
  recurring_pre_tax_amount: 1000,
  currency: 'USD',
  created_at: '2026-01-01T00:00:00Z',
  next_billing_date: '2026-02-01T00:00:00Z',
  previous_billing_date: '2026-01-01T00:00:00Z',
  payment_frequency_count: 1,
  payment_frequency_interval: 'Month',
  subscription_period_count: 1,
  subscription_period_interval: 'Month',
  trial_period_days: 0,
  tax_inclusive: false,
  on_demand: false,
  cancel_at_next_billing_date: false,
  metadata: {},
};

describe('DodoPayments.schema.TimeInterval', () => {
  it('accepts every documented interval', () => {
    for (const i of ['Day', 'Week', 'Month', 'Year']) {
      asserts.assertEquals(TimeIntervalSchemaObject.safeParse(i)[0], null, i);
    }
  });

  it('rejects a lowercase interval — the vendor is case-sensitive here', () => {
    asserts.assertExists(TimeIntervalSchemaObject.safeParse('month')[0]);
  });
});

describe('DodoPayments.schema.Subscription', () => {
  it('accepts an active subscription', () => {
    const [error, sub] = SubscriptionSchemaObject.safeParse(SUB);
    asserts.assertEquals(error, null);
    asserts.assertEquals(sub?.status, 'active');
  });

  it('accepts a period-end cancellation, which stays active', () => {
    const [error, sub] = SubscriptionSchemaObject.safeParse({
      ...SUB,
      cancel_at_next_billing_date: true,
    });
    asserts.assertEquals(error, null);
    // The documented trap: status is STILL active until the date passes.
    asserts.assertEquals(sub?.status, 'active');
    asserts.assertEquals(sub?.cancel_at_next_billing_date, true);
  });

  it('accepts an immediately-cancelled subscription', () => {
    const [error, sub] = SubscriptionSchemaObject.safeParse({
      ...SUB,
      status: 'cancelled',
      cancelled_at: '2026-01-15T00:00:00Z',
      cancellation_comment: 'Too expensive',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(sub?.status, 'cancelled');
    asserts.assertEquals(sub?.cancellation_comment, 'Too expensive');
  });

  it('accepts a trialing subscription', () => {
    asserts.assertEquals(
      SubscriptionSchemaObject.safeParse({
        ...SUB,
        status: 'pending',
        trial_period_days: 14,
        trial_amount: 0,
      })[0],
      null,
    );
  });

  it('keeps additive vendor fields such as addons and meters', () => {
    const [error, sub] = SubscriptionSchemaObject.safeParse({
      ...SUB,
      addons: [],
      meters: [],
      scheduled_change: null,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals((sub as Record<string, unknown>).addons, []);
  });

  it('rejects an undocumented status', () => {
    asserts.assertExists(
      SubscriptionSchemaObject.safeParse({ ...SUB, status: 'live' })[0],
    );
  });

  it('rejects a subscription missing its next billing date', () => {
    const { next_billing_date: _n, ...noDate } = SUB;
    asserts.assertExists(SubscriptionSchemaObject.safeParse(noDate)[0]);
  });
});

describe('DodoPayments.schema.SubscriptionList', () => {
  it('accepts a populated page', () => {
    const [error, page] = SubscriptionListSchemaObject.safeParse({
      items: [SUB],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.items.length, 1);
  });

  it('normalizes an absent items array to empty', () => {
    const [error, page] = SubscriptionListSchemaObject.safeParse({});
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.items, []);
  });

  it('rejects a page whose items are not subscriptions', () => {
    asserts.assertExists(
      SubscriptionListSchemaObject.safeParse({ items: ['sub_1'] })[0],
    );
  });

  it('treats a bare array body as the items themselves', () => {
    const [error, page] = SubscriptionListSchemaObject.safeParse([SUB]);
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.items.length, 1);
  });

  it('rejects a scalar body', () => {
    asserts.assertExists(SubscriptionListSchemaObject.safeParse('sub_1')[0]);
  });
});
