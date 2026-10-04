import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  TURNSTILE_ERROR_CODES,
  VerificationSchemaObject,
} from './Verification.ts';

describe('CloudflareTurnstile.schema.Verification', () => {
  it('accepts a full success body', () => {
    const [error, value] = VerificationSchemaObject.safeParse({
      success: true,
      'error-codes': [],
      challenge_ts: '2026-10-04T12:00:00.000Z',
      hostname: 'example.com',
      action: 'login',
      cdata: 'session-1',
      metadata: { ephemeral_id: 'x:9f78e0ed210960d7693b167e' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.success, true);
    asserts.assertEquals(value?.hostname, 'example.com');
    asserts.assertEquals(
      value?.metadata?.ephemeral_id,
      'x:9f78e0ed210960d7693b167e',
    );
  });

  it('accepts a minimal failure body', () => {
    const [error, value] = VerificationSchemaObject.safeParse({
      success: false,
      'error-codes': ['invalid-input-response'],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.['error-codes'], ['invalid-input-response']);
  });

  it('accepts `success` alone — every other field is optional', () => {
    asserts.assertEquals(
      VerificationSchemaObject.safeParse({ success: true })[0],
      null,
    );
  });

  it('keeps an undocumented error code and an additive field', () => {
    const [error, value] = VerificationSchemaObject.safeParse({
      success: false,
      'error-codes': ['brand-new-code'],
      some_future_field: 1,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.['error-codes'], ['brand-new-code']);
    asserts.assertEquals(
      (value as Record<string, unknown>).some_future_field,
      1,
    );
  });

  it('rejects a body without a boolean success', () => {
    asserts.assertExists(VerificationSchemaObject.safeParse({})[0]);
    asserts.assertExists(
      VerificationSchemaObject.safeParse({ success: 'yes' })[0],
    );
  });

  it('rejects error-codes that is not an array of strings', () => {
    asserts.assertExists(
      VerificationSchemaObject.safeParse({
        success: false,
        'error-codes': 'invalid-input-response',
      })[0],
    );
  });

  it('lists the documented codes plus the two connect-added ones', () => {
    asserts.assert(TURNSTILE_ERROR_CODES.includes('timeout-or-duplicate'));
    asserts.assert(TURNSTILE_ERROR_CODES.includes('hostname-mismatch'));
    asserts.assert(TURNSTILE_ERROR_CODES.includes('action-mismatch'));
  });
});
