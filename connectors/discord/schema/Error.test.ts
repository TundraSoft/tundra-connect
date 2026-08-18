import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorSchemaObject, RateLimitSchemaObject } from './Error.ts';

describe('Discord.schema.Error', () => {
  it('accepts a minimal error envelope', () => {
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        code: 50006,
        message: 'Cannot send an empty message',
      })[0],
      null,
    );
  });

  it('accepts the general error code 0', () => {
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        code: 0,
        message: '50035: Invalid Form Body',
      })[0],
      null,
    );
  });

  it('accepts a nested Invalid Form Body errors tree', () => {
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        code: 50035,
        message: 'Invalid Form Body',
        errors: {
          content: {
            _errors: [
              { code: 'BASE_TYPE_REQUIRED', message: 'This field is required' },
            ],
          },
        },
      })[0],
      null,
    );
  });

  it('rejects an envelope missing the required message', () => {
    asserts.assertExists(ErrorSchemaObject.safeParse({ code: 0 })[0]);
  });

  it('rejects an envelope missing the required code', () => {
    asserts.assertExists(ErrorSchemaObject.safeParse({ message: 'oops' })[0]);
  });
});

describe('Discord.schema.RateLimit', () => {
  it('accepts a documented rate-limit body', () => {
    asserts.assertEquals(
      RateLimitSchemaObject.safeParse({
        message: 'You are being rate limited.',
        retry_after: 0.65,
        global: false,
      })[0],
      null,
    );
  });

  it('accepts a global rate-limit body with a code', () => {
    asserts.assertEquals(
      RateLimitSchemaObject.safeParse({
        message: 'You are being rate limited.',
        retry_after: 64.57,
        global: true,
        code: 0,
      })[0],
      null,
    );
  });

  it('rejects a body missing retry_after', () => {
    asserts.assertExists(
      RateLimitSchemaObject.safeParse({
        message: 'You are being rate limited.',
        global: false,
      })[0],
    );
  });
});
