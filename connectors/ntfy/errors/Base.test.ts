import * as asserts from '@asserts';
import { describe, it } from '@test';
import { NtfyError } from './Base.ts';
import { NtfyErrorCodes } from './NtfyErrorCodes.ts';

describe('Ntfy.errors.Base', () => {
  it('formats a known vendor error code', () => {
    const error = new NtfyError('AUTH_REQUIRED', { status: 401 });
    asserts.assertStringIncludes(
      error.message,
      'ntfy rejected the request as unauthenticated',
    );
    asserts.assertEquals(error.getContextValue('vendor'), 'ntfy');
    asserts.assertEquals(error.code, 'AUTH_REQUIRED');
  });

  it('interpolates contextual error metadata', () => {
    const error = new NtfyError('RATE_LIMITED', { status: 429 });
    asserts.assertStringIncludes(error.message, 'HTTP 429');
  });

  it('falls back to the unknown error code', () => {
    const error = new NtfyError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      NtfyErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('carries the raw vendor error envelope as metadata', () => {
    const error = new NtfyError('BAD_REQUEST', {
      status: 400,
      vendorCode: 40001,
      link: 'https://ntfy.sh/docs/publish/',
    });
    asserts.assertEquals(error.getContextValue('status'), 400);
    asserts.assertEquals(error.getContextValue('vendorCode'), 40001);
    asserts.assertEquals(
      error.getContextValue('link'),
      'https://ntfy.sh/docs/publish/',
    );
  });

  it('defaults to the request-validation message when constructed without metadata', () => {
    const error = new NtfyError('REQUEST_VALIDATION_ERROR');
    asserts.assertStringIncludes(
      error.message,
      NtfyErrorCodes.REQUEST_VALIDATION_ERROR,
    );
  });

  it('fills a missing template placeholder instead of rendering it literally', () => {
    const error = new NtfyError('BAD_REQUEST');
    asserts.assertStringIncludes(error.message, '<status unavailable>');
    asserts.assertEquals(error.message.includes('${'), false);
  });
});
