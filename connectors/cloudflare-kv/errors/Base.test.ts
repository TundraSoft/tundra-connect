import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CloudflareKVError, CloudflareKVRateLimitError } from './Base.ts';
import {
  CLOUDFLARE_KV_TRANSIENT_CODES,
  CloudflareKVErrorCodes,
} from './CloudflareKVErrorCodes.ts';

describe('CloudflareKV.errors.Base', () => {
  it('formats a known error code and surfaces status and vendor code', () => {
    const error = new CloudflareKVError('NOT_FOUND', {
      status: 404,
      vendorCode: 10009,
      detail: "get: 'key not found' (code 10009)",
    });
    asserts.assertStringIncludes(error.message, 'does not exist');
    asserts.assertStringIncludes(error.message, '10009');
    asserts.assertEquals(error.getContextValue('vendor'), 'CloudflareKV');
    asserts.assertEquals(error.status, 404);
    asserts.assertEquals(error.vendorCode, 10009);
  });

  it('leaves status and vendor code undefined without a response', () => {
    const error = new CloudflareKVError('NETWORK_ERROR');
    asserts.assertEquals(error.status, undefined);
    asserts.assertEquals(error.vendorCode, undefined);
  });

  it('falls back to the unknown error code for an unregistered code', () => {
    const error = new CloudflareKVError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      CloudflareKVErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('network blip');
    const error = new CloudflareKVError('RESPONSE_ERROR', {}, cause);
    asserts.assertEquals(error.cause, cause);
  });

  it('fills missing message-template placeholders with a marker', () => {
    const error = new CloudflareKVError('KEY_TOO_LONG');
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertStringIncludes(error.message, '<bytes unavailable>');
  });

  it('flags exactly the transient codes', () => {
    for (const code of Object.keys(CloudflareKVErrorCodes)) {
      const error = new CloudflareKVError(code as never);
      asserts.assertEquals(
        error.transient,
        CLOUDFLARE_KV_TRANSIENT_CODES.has(error.code),
        code,
      );
    }
    asserts.assertEquals(
      [...CLOUDFLARE_KV_TRANSIENT_CODES].sort(),
      ['NETWORK_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'TIMEOUT'],
    );
  });

  it('gives a 429 its own class carrying the retry hint', () => {
    const error = new CloudflareKVRateLimitError({
      retryAfterSeconds: 7,
      detail: 'slow down',
    });
    asserts.assertInstanceOf(error, CloudflareKVError);
    asserts.assertEquals(error.code, 'RATE_LIMITED');
    asserts.assertEquals(error.status, 429);
    asserts.assertEquals(error.transient, true);
    asserts.assertEquals(error.retryAfterSeconds, 7);
    asserts.assertEquals(
      new CloudflareKVRateLimitError().retryAfterSeconds,
      undefined,
    );
  });
});
