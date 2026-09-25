import * as asserts from '@asserts';
import { describe, it } from '@test';
import { GCSError, GCSErrorCodes } from './mod.ts';

describe('GCS.errors.Base', () => {
  it('formats a known error code', () => {
    const error = new GCSError('NOT_FOUND');
    asserts.assertStringIncludes(error.message, GCSErrorCodes.NOT_FOUND);
    asserts.assertEquals(error.getContextValue('vendor'), 'GCS');
    asserts.assertEquals(error.code, 'NOT_FOUND');
  });

  it('interpolates contextual error metadata', () => {
    const error = new GCSError('CONFIG_INVALID_SERVICE_ACCOUNT', {
      field: 'clientEmail',
    });
    asserts.assertStringIncludes(
      error.message,
      'non-empty clientEmail',
    );
  });

  it('falls back to the unknown error code', () => {
    const error = new GCSError('INVALID_CODE' as never);
    asserts.assertStringIncludes(error.message, GCSErrorCodes.UNKNOWN_ERROR);
    asserts.assertEquals(error.getContextValue('originalCode'), 'INVALID_CODE');
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('preserves a wrapped cause', () => {
    const cause = new Error('network down');
    const error = new GCSError('TOKEN_EXCHANGE_FAILED', { status: 500 }, cause);
    asserts.assertEquals(error.cause, cause);
  });

  it('fills a missing template placeholder instead of rendering it literally', () => {
    const error = new GCSError('INVALID_REQUEST');
    asserts.assertStringIncludes(error.message, '<vendorMessage unavailable>');
    asserts.assertEquals(error.message.includes('${'), false);
  });
});
