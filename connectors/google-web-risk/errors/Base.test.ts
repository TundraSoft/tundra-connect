import * as asserts from '@asserts';
import { describe, it } from '@test';
import { GoogleWebRiskError } from './Base.ts';
import {
  GOOGLE_WEB_RISK_TRANSIENT_CODES,
  GoogleWebRiskErrorCodes,
} from './GoogleWebRiskErrorCodes.ts';

describe('GoogleWebRisk.errors.Base', () => {
  it('formats a known error code', () => {
    const error = new GoogleWebRiskError('SERVICE_UNAVAILABLE', {
      status: 503,
    });
    asserts.assertStringIncludes(error.message, 'unavailable');
    asserts.assertEquals(error.getContextValue('vendor'), 'GoogleWebRisk');
  });

  it('falls back to the unknown error code for an unregistered code', () => {
    const error = new GoogleWebRiskError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      GoogleWebRiskErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('exposes the resolved code as a public, readonly property', () => {
    const error = new GoogleWebRiskError('INVALID_REQUEST', { status: 400 });
    asserts.assertEquals(error.code, 'INVALID_REQUEST');
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('network blip');
    const error = new GoogleWebRiskError('RESPONSE_ERROR', {}, cause);
    asserts.assertEquals(error.cause, cause);
  });

  it('fills missing message-template placeholders with a marker', () => {
    const error = new GoogleWebRiskError('INVALID_REQUEST');
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertStringIncludes(error.message, '<status unavailable>');
  });

  it('flags the no-verdict-yet codes as transient, and nothing else', () => {
    for (const code of Object.keys(GoogleWebRiskErrorCodes)) {
      const error = new GoogleWebRiskError(
        code as keyof typeof GoogleWebRiskErrorCodes,
      );
      asserts.assertEquals(
        error.transient,
        GOOGLE_WEB_RISK_TRANSIENT_CODES.has(error.code),
        code,
      );
    }
    asserts.assertEquals(
      [...GOOGLE_WEB_RISK_TRANSIENT_CODES].sort(),
      ['NETWORK_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'TIMEOUT'],
    );
  });
});
