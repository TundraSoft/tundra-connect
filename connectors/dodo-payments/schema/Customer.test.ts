import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CustomerSchemaObject } from './Customer.ts';

const CUSTOMER = {
  customer_id: 'cus_1',
  business_id: 'biz_1',
  email: 'buyer@example.com',
  name: 'Ada',
  created_at: '2026-01-01T00:00:00Z',
};

describe('DodoPayments.schema.Customer', () => {
  it('accepts a minimal customer record', () => {
    const [error, customer] = CustomerSchemaObject.safeParse(CUSTOMER);
    asserts.assertEquals(error, null);
    asserts.assertEquals(customer?.customer_id, 'cus_1');
  });

  it('accepts optional contact and metadata fields', () => {
    const [error, customer] = CustomerSchemaObject.safeParse({
      ...CUSTOMER,
      phone_number: '+15551234567',
      metadata: { plan: 'pro' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(customer?.metadata?.plan, 'pro');
  });

  it('accepts a blocked customer', () => {
    const [error, customer] = CustomerSchemaObject.safeParse({
      ...CUSTOMER,
      blocked_at: '2026-02-01T00:00:00Z',
      blocklist_entry_id: 'blk_1',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(customer?.blocked_at, '2026-02-01T00:00:00Z');
  });

  it('accepts explicit nulls the vendor uses for unset fields', () => {
    asserts.assertEquals(
      CustomerSchemaObject.safeParse({
        ...CUSTOMER,
        phone_number: null,
        blocked_at: null,
      })[0],
      null,
    );
  });

  it('keeps additive vendor fields', () => {
    const [error, customer] = CustomerSchemaObject.safeParse({
      ...CUSTOMER,
      wallets: [],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals((customer as Record<string, unknown>).wallets, []);
  });

  it('rejects a record missing its business id', () => {
    const { business_id: _b, ...noBusiness } = CUSTOMER;
    asserts.assertExists(CustomerSchemaObject.safeParse(noBusiness)[0]);
  });

  it('rejects a non-object record', () => {
    asserts.assertExists(CustomerSchemaObject.safeParse('cus_1')[0]);
  });
});
