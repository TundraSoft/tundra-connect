import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  AddressSchemaObject,
  CreateCustomerRequestSchemaObject,
  CustomerSchemaObject,
} from './Customer.ts';

const validCustomer = {
  id: 'cus_abc123',
  object: 'customer',
  address: null,
  balance: 0,
  created: 1700000000,
  currency: null,
  default_source: null,
  delinquent: false,
  description: null,
  email: 'jenny@example.com',
  invoice_prefix: 'ABC123',
  invoice_settings: {},
  livemode: false,
  metadata: {},
  name: 'Jenny Rosen',
  next_invoice_sequence: 1,
  phone: null,
  preferred_locales: [],
  shipping: null,
  tax_exempt: 'none',
};

describe('Stripe.schema.Customer', () => {
  it('accepts an empty create request — no field is universally required', () => {
    const [error, parsed] = CreateCustomerRequestSchemaObject.safeParse({});
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed, {});
  });

  it('accepts a full create request', () => {
    const [error, parsed] = CreateCustomerRequestSchemaObject.safeParse({
      email: 'jenny@example.com',
      name: 'Jenny Rosen',
      description: 'A valued customer',
      phone: '+14155552671',
      metadata: { plan: 'gold' },
      address: { line1: '123 Main St', city: 'SF', country: 'US' },
      shipping: {
        name: 'Jenny Rosen',
        address: { line1: '123 Main St', country: 'US' },
      },
      balance: 0,
      tax_exempt: 'exempt',
      preferred_locales: ['en-US'],
      invoice_prefix: 'JEN',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.email, 'jenny@example.com');
    asserts.assertEquals(parsed?.address?.city, 'SF');
  });

  it('rejects an email over 512 characters', () => {
    asserts.assertExists(
      CreateCustomerRequestSchemaObject.safeParse({
        email: 'a'.repeat(505) + '@example.com',
      })[0],
    );
  });

  it('rejects an invalid tax_exempt value', () => {
    asserts.assertExists(
      CreateCustomerRequestSchemaObject.safeParse({ tax_exempt: 'bogus' })[0],
    );
  });

  it('parses an address with only some fields set', () => {
    const [error, address] = AddressSchemaObject.safeParse({ city: 'SF' });
    asserts.assertEquals(error, null);
    asserts.assertEquals(address?.city, 'SF');
    asserts.assertEquals(address?.line1, undefined);
  });

  it('parses a valid Customer response', () => {
    const [error, customer] = CustomerSchemaObject.safeParse(validCustomer);
    asserts.assertEquals(error, null);
    asserts.assertEquals(customer?.id, validCustomer.id);
    asserts.assertEquals(customer?.email, validCustomer.email);
  });

  it('accepts a Customer response with a populated address and shipping', () => {
    const [error] = CustomerSchemaObject.safeParse({
      ...validCustomer,
      address: { line1: '123 Main St', line2: null, country: 'US' },
      shipping: {
        name: 'Jenny Rosen',
        address: { line1: '123 Main St', country: 'US' },
      },
    });
    asserts.assertEquals(error, null);
  });

  it('rejects a Customer response with an undocumented tax_exempt value', () => {
    asserts.assertExists(
      CustomerSchemaObject.safeParse({
        ...validCustomer,
        tax_exempt: 'bogus',
      })[0],
    );
  });

  it('rejects a Customer response missing a required field', () => {
    const { id: _id, ...withoutId } = validCustomer;
    asserts.assertExists(CustomerSchemaObject.safeParse(withoutId)[0]);
  });

  it('keeps unmodeled fields via passthrough', () => {
    const [error, customer] = CustomerSchemaObject.safeParse({
      ...validCustomer,
      discount: null,
    });
    asserts.assertEquals(error, null);
    // deno-lint-ignore no-explicit-any
    asserts.assertEquals((customer as any).discount, null);
  });
});
