import * as asserts from '@asserts';
import { describe, it } from '@test';
import { EmailRefSchemaObject } from './EmailRef.ts';

describe('Resend.schema.EmailRef', () => {
  it('accepts a send response (id only)', () => {
    const [error, value] = EmailRefSchemaObject.safeParse({ id: 'e1' });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.id, 'e1');
  });

  it('accepts an update/cancel response with `object`', () => {
    const [error, value] = EmailRefSchemaObject.safeParse({
      object: 'email',
      id: 'e1',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.object, 'email');
  });

  it('rejects a missing or empty id', () => {
    asserts.assertExists(EmailRefSchemaObject.safeParse({})[0]);
    asserts.assertExists(EmailRefSchemaObject.safeParse({ id: '' })[0]);
  });
});
