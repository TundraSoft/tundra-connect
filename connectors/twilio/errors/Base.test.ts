import * as asserts from '@asserts';
import { describe, it } from '@test';
import { TwilioError } from './Base.ts';
import { TwilioErrorCodes } from './TwilioErrorCodes.ts';

describe('Twilio.errors.Base', () => {
  it('formats a known vendor error code', () => {
    const error = new TwilioError('AUTH_FAILED');
    asserts.assertStringIncludes(error.message, 'Authentication failed');
    asserts.assertEquals(error.getContextValue('vendor'), 'Twilio');
    asserts.assertEquals(error.code, 'AUTH_FAILED');
  });

  it('interpolates contextual error metadata', () => {
    const error = new TwilioError('CONFIG_INVALID_ACCOUNT_SID', {
      accountSid: 'bogus',
    });
    asserts.assertStringIncludes(error.message, "got 'bogus'");
  });

  it('falls back to the unknown error code', () => {
    const error = new TwilioError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(error.message, TwilioErrorCodes.UNKNOWN_ERROR);
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('preserves an underlying cause', () => {
    const cause = new Error('network down');
    const error = new TwilioError(
      'SERVICE_UNAVAILABLE',
      { status: 503 },
      cause,
    );
    asserts.assertEquals(error.cause, cause);
  });

  it('fills a missing template placeholder instead of rendering it literally', () => {
    const error = new TwilioError('CONFIG_INVALID_ACCOUNT_SID', {});
    asserts.assertStringIncludes(error.message, '<accountSid unavailable>');
    asserts.assertEquals(error.message.includes('${accountSid}'), false);
    asserts.assertEquals(error.message.includes('${'), false);
  });
});
