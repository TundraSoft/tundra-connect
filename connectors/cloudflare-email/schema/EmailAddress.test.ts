import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  EmailAddressSchemaObject,
  NamedEmailAddressSchemaObject,
} from './EmailAddress.ts';

describe('CloudflareEmail.schema.EmailAddress', () => {
  it('accepts a plain address string unchanged', () => {
    const [error, value] = EmailAddressSchemaObject.safeParse(
      'jane@example.com',
    );
    asserts.assertEquals(error, null);
    asserts.assertEquals(value, 'jane@example.com');
  });

  it('accepts a named object', () => {
    const [error, value] = EmailAddressSchemaObject.safeParse({
      address: 'jane@example.com',
      name: 'Jane Doe',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value, {
      address: 'jane@example.com',
      name: 'Jane Doe',
    });
  });

  it('accepts a named object without a name', () => {
    asserts.assertEquals(
      EmailAddressSchemaObject.safeParse({ address: 'jane@example.com' })[0],
      null,
    );
  });

  it('rejects a malformed plain address', () => {
    asserts.assertExists(EmailAddressSchemaObject.safeParse('nope')[0]);
  });

  it('rejects a named object with a malformed address', () => {
    asserts.assertExists(
      EmailAddressSchemaObject.safeParse({ address: 'nope', name: 'N' })[0],
    );
  });

  it('rejects the Workers-binding `email` key — REST takes `address`', () => {
    asserts.assertExists(
      EmailAddressSchemaObject.safeParse({
        email: 'jane@example.com',
        name: 'Jane',
      })[0],
    );
  });

  it('rejects a "Name <address>" string on its own (the request schema parses it)', () => {
    asserts.assertExists(
      EmailAddressSchemaObject.safeParse('Jane <jane@example.com>')[0],
    );
  });

  it('NamedEmailAddressSchemaObject requires `address`', () => {
    asserts.assertExists(
      NamedEmailAddressSchemaObject.safeParse({ name: 'Jane' })[0],
    );
  });
});
