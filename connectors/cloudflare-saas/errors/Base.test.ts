import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CloudflareSaaSError } from './Base.ts';
import {
  CLOUDFLARE_SAAS_TRANSIENT_CODES,
  CloudflareSaaSErrorCodes,
} from './CloudflareSaaSErrorCodes.ts';

describe('CloudflareSaaS.errors.Base', () => {
  it('formats a known error code', () => {
    const error = new CloudflareSaaSError('DUPLICATE_HOSTNAME', {
      status: 409,
      detail: 'Duplicate custom hostname found. (code 1406)',
    });
    asserts.assertStringIncludes(error.message, 'already exists');
    asserts.assertStringIncludes(error.message, '1406');
    asserts.assertEquals(error.getContextValue('vendor'), 'CloudflareSaaS');
  });

  it('falls back to the unknown error code for an unregistered code', () => {
    const error = new CloudflareSaaSError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      CloudflareSaaSErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('exposes the resolved code as a public, readonly property', () => {
    const error = new CloudflareSaaSError('QUOTA_EXCEEDED', { status: 403 });
    asserts.assertEquals(error.code, 'QUOTA_EXCEEDED');
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('network blip');
    const error = new CloudflareSaaSError('RESPONSE_ERROR', {}, cause);
    asserts.assertEquals(error.cause, cause);
  });

  it('fills missing message-template placeholders with a marker', () => {
    const error = new CloudflareSaaSError('INVALID_HOSTNAME');
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertStringIncludes(error.message, '<status unavailable>');
  });

  it('flags exactly the transient codes', () => {
    for (const code of Object.keys(CloudflareSaaSErrorCodes)) {
      const error = new CloudflareSaaSError(code as never);
      asserts.assertEquals(
        error.transient,
        CLOUDFLARE_SAAS_TRANSIENT_CODES.has(error.code),
        code,
      );
    }
    asserts.assertEquals(
      [...CLOUDFLARE_SAAS_TRANSIENT_CODES].sort(),
      ['NETWORK_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'TIMEOUT'],
    );
  });
});
