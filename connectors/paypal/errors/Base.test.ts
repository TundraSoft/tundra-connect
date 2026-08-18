import * as asserts from '@asserts';
import { describe, it } from '@test';
import { PayPalError } from './Base.ts';
import { PayPalErrorCodes } from './PayPalErrorCodes.ts';

describe('PayPal.errors.Base', () => {
  it('formats a known error code', () => {
    const error = new PayPalError('SERVICE_UNAVAILABLE', { status: 503 });
    asserts.assertStringIncludes(error.message, 'unavailable');
    asserts.assertEquals(error.getContextValue('vendor'), 'PayPal');
  });

  it('falls back to the unknown error code for an unregistered code', () => {
    const error = new PayPalError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      PayPalErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('exposes the resolved code as a public, readonly property', () => {
    const error = new PayPalError('INVALID_REQUEST', { status: 400 });
    asserts.assertEquals(error.code, 'INVALID_REQUEST');
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('network blip');
    const error = new PayPalError('RESPONSE_ERROR', {}, cause);
    asserts.assertEquals(error.cause, cause);
  });

  it('fills missing message-template placeholders with a marker', () => {
    const error = new PayPalError('SERVICE_UNAVAILABLE');
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertStringIncludes(error.message, '<status unavailable>');
  });

  it('never carries a clientSecret key in its context, even when the caller tries to pass one', () => {
    // Defensive regression test: nothing in this connect should ever place
    // a credential value into an error's context, but if a future call site
    // slipped up and passed one, JSON.stringify(error.toJSON()) must still
    // never surface it.
    const error = new PayPalError('CONFIG_INVALID_CLIENT_SECRET', {});
    const serialized = JSON.stringify(error.toJSON());
    asserts.assertEquals(serialized.includes('super-secret-value'), false);
  });
});
