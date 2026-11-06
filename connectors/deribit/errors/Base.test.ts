import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  DERIBIT_TRANSIENT_CODES,
  DeribitError,
  DeribitErrorCodes,
} from './mod.ts';

describe('Deribit.errors.Base', () => {
  it('formats a known vendor error code', () => {
    const error = new DeribitError('UNAUTHORIZED', {
      status: 401,
      vendorCode: 13009,
      vendorMessage: 'unauthorized',
    });
    asserts.assertStringIncludes(
      error.message,
      'Deribit refused the credentials or the call needs them: unauthorized (code 13009)',
    );
    asserts.assertEquals(error.getContextValue('vendor'), 'Deribit');
    asserts.assertEquals(error.getContextValue('status'), 401);
    asserts.assertEquals(error.code, 'UNAUTHORIZED');
  });

  it('interpolates contextual error metadata', () => {
    const error = new DeribitError('RATE_LIMITED', { vendorCode: 10028 });
    asserts.assertStringIncludes(error.message, 'code 10028');
  });

  it('falls back to the unknown error code', () => {
    const error = new DeribitError('INVALID_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      DeribitErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(error.getContextValue('originalCode'), 'INVALID_CODE');
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('fills a missing template placeholder instead of rendering it literally', () => {
    const error = new DeribitError('RATE_LIMITED');
    asserts.assertStringIncludes(error.message, '<vendorCode unavailable>');
    asserts.assertEquals(error.message.includes('${'), false);
  });

  it('flags exactly the transient codes', () => {
    for (const code of Object.keys(DeribitErrorCodes)) {
      const error = new DeribitError(code as never);
      asserts.assertEquals(
        error.transient,
        DERIBIT_TRANSIENT_CODES.has(error.code),
        code,
      );
    }
    asserts.assertEquals(
      [...DERIBIT_TRANSIENT_CODES].sort(),
      ['NETWORK_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'TIMEOUT'],
    );
  });
});
