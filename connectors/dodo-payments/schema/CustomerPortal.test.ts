import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CustomerPortalSessionSchemaObject } from './CustomerPortal.ts';

describe('DodoPayments.schema.CustomerPortalSession', () => {
  it('accepts a session link', () => {
    const [error, session] = CustomerPortalSessionSchemaObject.safeParse({
      link: 'https://customer.dodopayments.com/session/abc',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      session?.link,
      'https://customer.dodopayments.com/session/abc',
    );
  });

  it('rejects a missing or empty link', () => {
    asserts.assertExists(CustomerPortalSessionSchemaObject.safeParse({})[0]);
    asserts.assertExists(
      CustomerPortalSessionSchemaObject.safeParse({ link: '' })[0],
    );
  });
});
