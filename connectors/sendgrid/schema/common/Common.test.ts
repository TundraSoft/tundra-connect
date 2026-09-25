import * as asserts from '@asserts';
import { describe, it } from '@test';
import { EmailAddressSchemaObject, stringMapGuard } from './Common.ts';

describe('SendGrid.schema.Common', () => {
  it('accepts a valid email address with a display name', () => {
    const [error, address] = EmailAddressSchemaObject.safeParse({
      email: 'sender@example.com',
      name: 'Example Sender',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(address?.email, 'sender@example.com');
    asserts.assertEquals(address?.name, 'Example Sender');
  });

  it('accepts an email address without a display name', () => {
    asserts.assertEquals(
      EmailAddressSchemaObject.safeParse({ email: 'sender@example.com' })[0],
      null,
    );
  });

  it('rejects a malformed email address', () => {
    asserts.assertExists(
      EmailAddressSchemaObject.safeParse({ email: 'not-an-email' })[0],
    );
  });

  it('rejects a missing email field', () => {
    asserts.assertExists(
      EmailAddressSchemaObject.safeParse({ name: 'No Email' })[0],
    );
  });

  it('validates freeform string maps', () => {
    asserts.assertEquals(
      stringMapGuard.safeParse({ 'X-Trace-Id': 'abc123' })[0],
      null,
    );
    asserts.assertExists(stringMapGuard.safeParse({ count: null })[0]);
  });
});
