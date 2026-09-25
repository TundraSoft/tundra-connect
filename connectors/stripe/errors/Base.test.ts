import * as asserts from '@asserts';
import { describe, it } from '@test';
import { StripeError } from './Base.ts';
import { StripeErrorCodes } from './StripeErrorCodes.ts';

describe('Stripe.errors.Base', () => {
  it('formats a known vendor error code', () => {
    const error = new StripeError('CARD_DECLINED', {
      vendorMessage: 'Your card was declined.',
    });
    asserts.assertStringIncludes(error.message, 'card was declined');
    asserts.assertEquals(error.getContextValue('vendor'), 'Stripe');
    asserts.assertEquals(error.code, 'CARD_DECLINED');
  });

  it('interpolates contextual error metadata', () => {
    const error = new StripeError('INVALID_REQUEST', {
      reason: 'bogus',
    });
    asserts.assertStringIncludes(error.message, 'bogus');
  });

  it('never interpolates the raw secretKey into CONFIG_INVALID_SECRET_KEY (security: avoid leaking live credentials into a logged .message)', () => {
    const error = new StripeError('CONFIG_INVALID_SECRET_KEY', {});
    asserts.assertStringIncludes(
      error.message,
      "must be a non-empty string starting with 'sk_' or 'rk_'.",
    );
    asserts.assertEquals(error.message.includes('got '), false);
  });

  it('falls back to the unknown error code', () => {
    const error = new StripeError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(error.message, StripeErrorCodes.UNKNOWN_ERROR);
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('preserves an underlying cause', () => {
    const cause = new Error('network down');
    const error = new StripeError(
      'SERVICE_UNAVAILABLE',
      { status: 503 },
      cause,
    );
    asserts.assertEquals(error.cause, cause);
  });

  it('fills a missing template placeholder instead of rendering it literally', () => {
    const error = new StripeError('CARD_DECLINED', {});
    asserts.assertStringIncludes(error.message, '<vendorMessage unavailable>');
    asserts.assertEquals(error.message.includes('${'), false);
  });
});
