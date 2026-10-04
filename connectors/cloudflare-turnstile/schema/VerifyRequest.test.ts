import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  MAX_TOKEN_LENGTH,
  VerifyRequestSchemaObject,
} from './VerifyRequest.ts';

describe('CloudflareTurnstile.schema.VerifyRequest', () => {
  it('accepts a token alone', () => {
    const [error, value] = VerifyRequestSchemaObject.safeParse({
      response: 'XXXX.DUMMY.TOKEN.XXXX',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.response, 'XXXX.DUMMY.TOKEN.XXXX');
  });

  it('accepts the optional remoteip and idempotency_key', () => {
    const [error, value] = VerifyRequestSchemaObject.safeParse({
      response: 'tok',
      remoteip: '203.0.113.7',
      idempotency_key: '0f3c9a3e-1b2d-4c5e-8f9a-0b1c2d3e4f5a',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.remoteip, '203.0.113.7');
  });

  it('accepts a token of exactly the maximum length', () => {
    asserts.assertEquals(
      VerifyRequestSchemaObject.safeParse({
        response: 'x'.repeat(MAX_TOKEN_LENGTH),
      })[0],
      null,
    );
  });

  it('rejects an over-long token', () => {
    asserts.assertExists(
      VerifyRequestSchemaObject.safeParse({
        response: 'x'.repeat(MAX_TOKEN_LENGTH + 1),
      })[0],
    );
  });

  it('rejects an empty or missing token', () => {
    asserts.assertExists(
      VerifyRequestSchemaObject.safeParse({ response: '' })[0],
    );
    asserts.assertExists(VerifyRequestSchemaObject.safeParse({})[0]);
  });

  it('rejects a blank remoteip', () => {
    asserts.assertExists(
      VerifyRequestSchemaObject.safeParse({ response: 'tok', remoteip: '' })[0],
    );
  });

  it('rejects a non-object request', () => {
    asserts.assertExists(VerifyRequestSchemaObject.safeParse('tok')[0]);
  });
});
