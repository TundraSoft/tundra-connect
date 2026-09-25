import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CreatePaymentIntentRequestSchemaObject,
  PaymentIntentSchemaObject,
} from './PaymentIntent.ts';

const validPaymentIntent = {
  id: 'pi_3Nx0aB2c3D4e5F6g',
  object: 'payment_intent',
  amount: 1999,
  amount_capturable: 0,
  amount_received: 0,
  currency: 'usd',
  status: 'requires_payment_method',
  client_secret: 'pi_3Nx0aB2c3D4e5F6g_secret_abc',
  created: 1700000000,
  customer: null,
  description: null,
  livemode: false,
  metadata: {},
  payment_method: null,
  payment_method_types: ['card'],
  capture_method: 'automatic',
  confirmation_method: 'automatic',
  last_payment_error: null,
  latest_charge: null,
  next_action: null,
};

describe('Stripe.schema.PaymentIntent', () => {
  it('accepts a minimal create request (amount + currency only)', () => {
    const [error, parsed] = CreatePaymentIntentRequestSchemaObject.safeParse({
      amount: 1999,
      currency: 'usd',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.amount, 1999);
    asserts.assertEquals(parsed?.currency, 'usd');
  });

  it('accepts a full create request', () => {
    const [error, parsed] = CreatePaymentIntentRequestSchemaObject.safeParse({
      amount: 1999,
      currency: 'usd',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      customer: 'cus_abc123',
      description: 'Order #1234',
      metadata: { orderId: '1234' },
      confirm: false,
      capture_method: 'manual',
      receipt_email: 'a@example.com',
      setup_future_usage: 'off_session',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      parsed?.automatic_payment_methods?.allow_redirects,
      'never',
    );
  });

  it('rejects a request missing amount', () => {
    asserts.assertExists(
      CreatePaymentIntentRequestSchemaObject.safeParse({ currency: 'usd' })[0],
    );
  });

  it('rejects a request missing currency', () => {
    asserts.assertExists(
      CreatePaymentIntentRequestSchemaObject.safeParse({ amount: 100 })[0],
    );
  });

  it('rejects a non-integer amount', () => {
    asserts.assertExists(
      CreatePaymentIntentRequestSchemaObject.safeParse({
        amount: 19.99,
        currency: 'usd',
      })[0],
    );
  });

  it('rejects an uppercase currency', () => {
    asserts.assertExists(
      CreatePaymentIntentRequestSchemaObject.safeParse({
        amount: 100,
        currency: 'USD',
      })[0],
    );
  });

  it('rejects an invalid capture_method', () => {
    asserts.assertExists(
      CreatePaymentIntentRequestSchemaObject.safeParse({
        amount: 100,
        currency: 'usd',
        capture_method: 'bogus',
      })[0],
    );
  });

  it('parses a valid PaymentIntent response', () => {
    const [error, intent] = PaymentIntentSchemaObject.safeParse(
      validPaymentIntent,
    );
    asserts.assertEquals(error, null);
    asserts.assertEquals(intent?.id, validPaymentIntent.id);
    asserts.assertEquals(intent?.status, 'requires_payment_method');
  });

  it('accepts a PaymentIntent response with a populated last_payment_error', () => {
    const [error] = PaymentIntentSchemaObject.safeParse({
      ...validPaymentIntent,
      last_payment_error: {
        code: 'card_declined',
        message: 'Your card was declined.',
      },
    });
    asserts.assertEquals(error, null);
  });

  it('rejects a PaymentIntent response with an undocumented status', () => {
    asserts.assertExists(
      PaymentIntentSchemaObject.safeParse({
        ...validPaymentIntent,
        status: 'bogus_status',
      })[0],
    );
  });

  it('rejects a PaymentIntent response missing a required field', () => {
    const { id: _id, ...withoutId } = validPaymentIntent;
    asserts.assertExists(PaymentIntentSchemaObject.safeParse(withoutId)[0]);
  });

  it('keeps unmodeled fields via passthrough', () => {
    const [error, intent] = PaymentIntentSchemaObject.safeParse({
      ...validPaymentIntent,
      canceled_at: null,
      application: null,
    });
    asserts.assertEquals(error, null);
    // deno-lint-ignore no-explicit-any
    asserts.assertEquals((intent as any).canceled_at, null);
  });
});
