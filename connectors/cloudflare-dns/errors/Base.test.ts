import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CloudflareDNSError } from './Base.ts';
import {
  CLOUDFLARE_DNS_TRANSIENT_CODES,
  CloudflareDNSErrorCodes,
} from './CloudflareDNSErrorCodes.ts';

describe('CloudflareDNS.errors.Base', () => {
  it('formats a known error code', () => {
    const error = new CloudflareDNSError('RECORD_CONFLICT', {
      status: 400,
      detail: 'An identical record already exists. (code 81057)',
    });
    asserts.assertStringIncludes(error.message, 'already exists');
    asserts.assertStringIncludes(error.message, '81057');
    asserts.assertEquals(error.getContextValue('vendor'), 'CloudflareDNS');
  });

  it('falls back to the unknown error code for an unregistered code', () => {
    const error = new CloudflareDNSError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      CloudflareDNSErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('exposes the resolved code as a public, readonly property', () => {
    const error = new CloudflareDNSError('NOT_FOUND', { status: 404 });
    asserts.assertEquals(error.code, 'NOT_FOUND');
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('network blip');
    const error = new CloudflareDNSError('RESPONSE_ERROR', {}, cause);
    asserts.assertEquals(error.cause, cause);
  });

  it('fills missing message-template placeholders with a marker', () => {
    const error = new CloudflareDNSError('INVALID_REQUEST');
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertStringIncludes(error.message, '<status unavailable>');
  });

  it('flags exactly the transient codes', () => {
    for (const code of Object.keys(CloudflareDNSErrorCodes)) {
      const error = new CloudflareDNSError(code as never);
      asserts.assertEquals(
        error.transient,
        CLOUDFLARE_DNS_TRANSIENT_CODES.has(error.code),
        code,
      );
    }
    asserts.assertEquals(
      [...CLOUDFLARE_DNS_TRANSIENT_CODES].sort(),
      ['NETWORK_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'TIMEOUT'],
    );
  });
});
