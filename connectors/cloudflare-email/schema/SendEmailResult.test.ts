import * as asserts from '@asserts';
import { describe, it } from '@test';
import { SendEmailResultSchemaObject } from './SendEmailResult.ts';

describe('CloudflareEmail.schema.SendEmailResult', () => {
  it('accepts a fully-populated result', () => {
    const [error, result] = SendEmailResultSchemaObject.safeParse({
      delivered: ['a@example.com'],
      queued: ['b@example.com'],
      permanent_bounces: ['c@example.com'],
      suppressed_recipients: ['d@example.com'],
      message_id: 'msg-1',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.delivered, ['a@example.com']);
    asserts.assertEquals(result?.message_id, 'msg-1');
  });

  it('accepts an empty result object — every field is optional', () => {
    asserts.assertEquals(SendEmailResultSchemaObject.safeParse({})[0], null);
  });

  it('keeps an additive vendor field rather than stripping or rejecting it', () => {
    const [error, result] = SendEmailResultSchemaObject.safeParse({
      delivered: [],
      some_future_field: 'value',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      (result as Record<string, unknown>).some_future_field,
      'value',
    );
  });

  it('rejects a delivered value that is not an array', () => {
    asserts.assertExists(
      SendEmailResultSchemaObject.safeParse({ delivered: 'a@example.com' })[0],
    );
  });

  it('rejects a non-object result', () => {
    asserts.assertExists(SendEmailResultSchemaObject.safeParse('ok')[0]);
  });
});
