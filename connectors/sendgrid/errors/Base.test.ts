import * as asserts from '@asserts';
import { describe, it } from '@test';
import { SendGridError } from './Base.ts';
import { SendGridErrorCodes } from './SendGridErrorCodes.ts';

describe('SendGrid.errors.Base', () => {
  it('formats a known vendor error code', () => {
    const error = new SendGridError('AUTH_REQUIRED', { status: 401 });
    asserts.assertStringIncludes(
      error.message,
      'SendGrid rejected the request as unauthenticated',
    );
    asserts.assertEquals(error.getContextValue('vendor'), 'SendGrid');
    asserts.assertEquals(error.code, 'AUTH_REQUIRED');
  });

  it('interpolates contextual error metadata', () => {
    const error = new SendGridError('RATE_LIMITED', { status: 429 });
    asserts.assertStringIncludes(error.message, 'HTTP 429');
  });

  it('falls back to the unknown error code', () => {
    const error = new SendGridError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      SendGridErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('carries the raw vendor errors array as metadata', () => {
    const error = new SendGridError('VALIDATION_ERROR', {
      status: 400,
      errors: [
        {
          message: 'The from email does not contain a valid address.',
          field: 'from.email',
        },
      ],
    });
    asserts.assertEquals(error.getContextValue('status'), 400);
    const errors = error.getContextValue('errors') as Array<
      { message: string; field: string | null }
    >;
    asserts.assertEquals(errors.length, 1);
    asserts.assertEquals(errors[0]?.field, 'from.email');
  });

  it('defaults to the config-invalid-api-key message when constructed without metadata', () => {
    const error = new SendGridError('CONFIG_INVALID_API_KEY');
    asserts.assertStringIncludes(
      error.message,
      SendGridErrorCodes.CONFIG_INVALID_API_KEY,
    );
  });

  it('fills a missing template placeholder instead of rendering it literally', () => {
    const error = new SendGridError('RATE_LIMITED');
    asserts.assertStringIncludes(error.message, '<status unavailable>');
    asserts.assertEquals(error.message.includes('${'), false);
  });
});
