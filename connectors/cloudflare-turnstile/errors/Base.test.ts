import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CloudflareTurnstileError } from './Base.ts';
import {
  CLOUDFLARE_TURNSTILE_TRANSIENT_CODES,
  CloudflareTurnstileErrorCodes,
} from './CloudflareTurnstileErrorCodes.ts';

describe('CloudflareTurnstile.errors.Base', () => {
  it('formats a known error code', () => {
    const error = new CloudflareTurnstileError('SERVICE_UNAVAILABLE', {
      status: 503,
      vendorCodes: 'internal-error',
    });
    asserts.assertStringIncludes(error.message, 'unavailable');
    asserts.assertStringIncludes(error.message, 'internal-error');
    asserts.assertEquals(
      error.getContextValue('vendor'),
      'CloudflareTurnstile',
    );
  });

  it('falls back to the unknown error code for an unregistered code', () => {
    const error = new CloudflareTurnstileError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      CloudflareTurnstileErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
    asserts.assertEquals(error.transient, false);
  });

  it('exposes the resolved code as a public, readonly property', () => {
    const error = new CloudflareTurnstileError('AUTH_FAILED', { status: 200 });
    asserts.assertEquals(error.code, 'AUTH_FAILED');
  });

  it('flags exactly the transient codes', () => {
    for (const code of Object.keys(CloudflareTurnstileErrorCodes)) {
      const error = new CloudflareTurnstileError(code as never);
      asserts.assertEquals(
        error.transient,
        CLOUDFLARE_TURNSTILE_TRANSIENT_CODES.has(error.code),
        code,
      );
    }
    asserts.assertEquals(
      [...CLOUDFLARE_TURNSTILE_TRANSIENT_CODES].sort(),
      ['NETWORK_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'TIMEOUT'],
    );
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('network blip');
    const error = new CloudflareTurnstileError('NETWORK_ERROR', {}, cause);
    asserts.assertEquals(error.cause, cause);
  });

  it('fills missing message-template placeholders with a marker', () => {
    const error = new CloudflareTurnstileError('INVALID_REQUEST');
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertStringIncludes(error.message, '<status unavailable>');
  });
});
