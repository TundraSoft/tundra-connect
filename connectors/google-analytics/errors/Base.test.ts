import * as asserts from '@asserts';
import { describe, it } from '@test';
import { GoogleAnalyticsError } from './Base.ts';
import {
  GOOGLE_ANALYTICS_TRANSIENT_CODES,
  GoogleAnalyticsErrorCodes,
} from './GoogleAnalyticsErrorCodes.ts';

describe('GoogleAnalytics.errors.Base', () => {
  it('formats a known error code', () => {
    const error = new GoogleAnalyticsError('SERVICE_UNAVAILABLE', {
      status: 503,
    });
    asserts.assertStringIncludes(error.message, 'unavailable');
    asserts.assertEquals(error.getContextValue('vendor'), 'GoogleAnalytics');
  });

  it('falls back to the unknown error code for an unregistered code', () => {
    const error = new GoogleAnalyticsError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      GoogleAnalyticsErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
    asserts.assertEquals(error.transient, false);
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('network blip');
    const error = new GoogleAnalyticsError('NETWORK_ERROR', {}, cause);
    asserts.assertEquals(error.cause, cause);
  });

  it('fills missing message-template placeholders with a marker', () => {
    const error = new GoogleAnalyticsError('REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertStringIncludes(error.message, '<reason unavailable>');
  });

  it('flags exactly the transient codes', () => {
    for (const code of Object.keys(GoogleAnalyticsErrorCodes)) {
      const error = new GoogleAnalyticsError(code as never);
      asserts.assertEquals(
        error.transient,
        GOOGLE_ANALYTICS_TRANSIENT_CODES.has(error.code),
        code,
      );
    }
    asserts.assertEquals(
      [...GOOGLE_ANALYTICS_TRANSIENT_CODES].sort(),
      ['NETWORK_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'TIMEOUT'],
    );
  });
});
