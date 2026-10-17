import * as asserts from '@asserts';
import { describe, it } from '@test';
import { GoogleCertificateManagerError } from './Base.ts';
import {
  GOOGLE_CERTIFICATE_MANAGER_TRANSIENT_CODES,
  GoogleCertificateManagerErrorCodes,
} from './GoogleCertificateManagerErrorCodes.ts';

describe('GoogleCertificateManager.errors.Base', () => {
  it('formats a known error code', () => {
    const error = new GoogleCertificateManagerError('SERVICE_UNAVAILABLE', {
      status: 503,
    });
    asserts.assertStringIncludes(error.message, 'unavailable');
    asserts.assertEquals(
      error.getContextValue('vendor'),
      'GoogleCertificateManager',
    );
  });

  it('falls back to the unknown error code for an unregistered code', () => {
    const error = new GoogleCertificateManagerError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      GoogleCertificateManagerErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('exposes the resolved code as a public, readonly property', () => {
    const error = new GoogleCertificateManagerError('INVALID_REQUEST', {
      status: 400,
    });
    asserts.assertEquals(error.code, 'INVALID_REQUEST');
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('network blip');
    const error = new GoogleCertificateManagerError(
      'RESPONSE_ERROR',
      {},
      cause,
    );
    asserts.assertEquals(error.cause, cause);
  });

  it('fills missing message-template placeholders with a marker', () => {
    const error = new GoogleCertificateManagerError('INVALID_REQUEST');
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertStringIncludes(error.message, '<status unavailable>');
  });

  it('flags exactly the transient codes', () => {
    for (const code of Object.keys(GoogleCertificateManagerErrorCodes)) {
      const error = new GoogleCertificateManagerError(code as never);
      asserts.assertEquals(
        error.transient,
        GOOGLE_CERTIFICATE_MANAGER_TRANSIENT_CODES.has(error.code),
        code,
      );
    }
    asserts.assertEquals(
      [...GOOGLE_CERTIFICATE_MANAGER_TRANSIENT_CODES].sort(),
      [
        'CONFLICT',
        'NETWORK_ERROR',
        'OPERATION_TIMEOUT',
        'RATE_LIMITED',
        'SERVICE_UNAVAILABLE',
        'TIMEOUT',
      ],
    );
  });
});
