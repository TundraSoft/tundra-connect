import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  BillingAddressSchemaObject,
  CustomerDetailsSchemaObject,
  CustomerRequestSchemaObject,
  IntentStatusSchemaObject,
  SubscriptionStatusSchemaObject,
} from './Common.ts';

describe('DodoPayments.schema.IntentStatus', () => {
  it('accepts every documented status', () => {
    for (
      const s of [
        'succeeded',
        'failed',
        'cancelled',
        'processing',
        'requires_customer_action',
        'requires_merchant_action',
        'requires_payment_method',
        'requires_confirmation',
        'requires_capture',
        'partially_captured',
        'partially_captured_and_capturable',
      ]
    ) {
      asserts.assertEquals(IntentStatusSchemaObject.safeParse(s)[0], null, s);
    }
  });

  it('rejects an undocumented status', () => {
    asserts.assertExists(IntentStatusSchemaObject.safeParse('paid')[0]);
  });
});

describe('DodoPayments.schema.SubscriptionStatus', () => {
  it('accepts every documented status', () => {
    for (
      const s of [
        'pending',
        'active',
        'on_hold',
        'paused',
        'cancelled',
        'failed',
        'expired',
        'past_due',
      ]
    ) {
      asserts.assertEquals(
        SubscriptionStatusSchemaObject.safeParse(s)[0],
        null,
        s,
      );
    }
  });

  it('rejects an undocumented status', () => {
    asserts.assertExists(SubscriptionStatusSchemaObject.safeParse('live')[0]);
  });
});

describe('DodoPayments.schema.BillingAddress', () => {
  it('accepts a country-only address', () => {
    asserts.assertEquals(
      BillingAddressSchemaObject.safeParse({ country: 'US' })[0],
      null,
    );
  });

  it('accepts a fully-specified address', () => {
    const [error, billing] = BillingAddressSchemaObject.safeParse({
      country: 'DE',
      city: 'Berlin',
      state: 'BE',
      street: 'Hauptstr. 1',
      zipcode: '10115',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(billing?.city, 'Berlin');
  });

  it('accepts explicit nulls for the optional parts', () => {
    asserts.assertEquals(
      BillingAddressSchemaObject.safeParse({ country: 'US', city: null })[0],
      null,
    );
  });

  it('rejects a missing country — required by a merchant of record', () => {
    asserts.assertExists(
      BillingAddressSchemaObject.safeParse({ city: 'Austin' })[0],
    );
  });

  it('rejects a blank country', () => {
    asserts.assertExists(
      BillingAddressSchemaObject.safeParse({ country: '' })[0],
    );
  });
});

describe('DodoPayments.schema.CustomerDetails', () => {
  it('accepts the embedded customer summary', () => {
    const [error, customer] = CustomerDetailsSchemaObject.safeParse({
      customer_id: 'cus_1',
      email: 'a@example.com',
      name: 'Ada',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(customer?.customer_id, 'cus_1');
  });

  it('rejects a summary missing its id', () => {
    asserts.assertExists(
      CustomerDetailsSchemaObject.safeParse({
        email: 'a@example.com',
        name: 'Ada',
      })[0],
    );
  });
});

describe('DodoPayments.schema.CustomerRequest', () => {
  it('accepts an existing customer by id', () => {
    asserts.assertEquals(
      CustomerRequestSchemaObject.safeParse({ customer_id: 'cus_1' })[0],
      null,
    );
  });

  it('accepts a new customer by email', () => {
    asserts.assertEquals(
      CustomerRequestSchemaObject.safeParse({
        email: 'a@example.com',
        name: 'Ada',
      })[0],
      null,
    );
  });

  it('accepts a bare email with no name', () => {
    asserts.assertEquals(
      CustomerRequestSchemaObject.safeParse({ email: 'a@example.com' })[0],
      null,
    );
  });

  it('rejects neither an id nor an email', () => {
    asserts.assertExists(
      CustomerRequestSchemaObject.safeParse({ name: 'Ada' })[0],
    );
  });

  it('rejects a malformed email', () => {
    asserts.assertExists(
      CustomerRequestSchemaObject.safeParse({ email: 'not-an-email' })[0],
    );
  });

  it('rejects a blank customer id', () => {
    asserts.assertExists(
      CustomerRequestSchemaObject.safeParse({ customer_id: '' })[0],
    );
  });
});
