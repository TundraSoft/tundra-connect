import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorSchemaObject, StripeErrorDetailSchemaObject } from './Error.ts';

describe('Stripe.schema.Error', () => {
  it('parses a minimal error detail (type only)', () => {
    const [error, detail] = StripeErrorDetailSchemaObject.safeParse({
      type: 'api_error',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(detail?.type, 'api_error');
  });

  it('parses a full card_error detail', () => {
    const [error, detail] = StripeErrorDetailSchemaObject.safeParse({
      type: 'card_error',
      code: 'card_declined',
      message: 'Your card was declined.',
      param: 'payment_method',
      decline_code: 'generic_decline',
      charge: 'ch_abc123',
      doc_url: 'https://docs.stripe.com/error-codes#card-declined',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(detail?.decline_code, 'generic_decline');
  });

  it('rejects an undocumented error type', () => {
    asserts.assertExists(
      StripeErrorDetailSchemaObject.safeParse({ type: 'rate_limit_error' })[0],
    );
  });

  it('keeps unmodeled fields via passthrough', () => {
    const [error, detail] = StripeErrorDetailSchemaObject.safeParse({
      type: 'invalid_request_error',
      request_log_url: 'https://dashboard.stripe.com/logs/req_abc',
    });
    asserts.assertEquals(error, null);
    // deno-lint-ignore no-explicit-any
    asserts.assertEquals(
      (detail as any).request_log_url,
      'https://dashboard.stripe.com/logs/req_abc',
    );
  });

  it('parses the full envelope', () => {
    const [error, envelope] = ErrorSchemaObject.safeParse({
      error: {
        type: 'invalid_request_error',
        code: 'parameter_missing',
        message: "Missing required param: 'amount'.",
        param: 'amount',
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.error.code, 'parameter_missing');
  });

  it('rejects a response without an error object', () => {
    asserts.assertExists(ErrorSchemaObject.safeParse({ message: 'oops' })[0]);
  });
});
