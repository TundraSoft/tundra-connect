import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  currencyGuard,
  metadataGuard,
  paymentIntentIdGuard,
  secretKeyGuard,
} from './Common.ts';

describe('Stripe.schema.Common', () => {
  it('accepts a valid test-mode secret key', () => {
    asserts.assertEquals(
      secretKeyGuard.safeParse('sk_test_51abcXYZ')[0],
      null,
    );
  });

  it('accepts a valid live-mode restricted key', () => {
    asserts.assertEquals(
      secretKeyGuard.safeParse('rk_live_51abcXYZ')[0],
      null,
    );
  });

  it('rejects a publishable key', () => {
    asserts.assertExists(secretKeyGuard.safeParse('pk_test_51abcXYZ')[0]);
  });

  it('rejects a key missing the test/live segment', () => {
    asserts.assertExists(secretKeyGuard.safeParse('sk_51abcXYZ')[0]);
  });

  it('accepts a valid PaymentIntent id', () => {
    asserts.assertEquals(
      paymentIntentIdGuard.safeParse('pi_3Nx0aB2c3D4e5F6g')[0],
      null,
    );
  });

  it('rejects a PaymentIntent id with the wrong prefix', () => {
    asserts.assertExists(paymentIntentIdGuard.safeParse('cus_abc123')[0]);
  });

  it('accepts a lowercase ISO 4217 currency code', () => {
    asserts.assertEquals(currencyGuard.safeParse('usd')[0], null);
  });

  it('rejects an uppercase currency code', () => {
    asserts.assertExists(currencyGuard.safeParse('USD')[0]);
  });

  it('rejects a currency code of the wrong length', () => {
    asserts.assertExists(currencyGuard.safeParse('us')[0]);
  });

  it('accepts a string-to-string metadata map', () => {
    asserts.assertEquals(
      metadataGuard.safeParse({ orderId: '6735' })[0],
      null,
    );
  });

  it('coerces a numeric metadata value to a string (Guardian.string() coerces by default)', () => {
    const [error, parsed] = metadataGuard.safeParse({ orderId: 6735 });
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.orderId, '6735');
  });

  it('rejects metadata with a value that cannot be coerced to a string', () => {
    asserts.assertExists(
      metadataGuard.safeParse({ orderId: { nested: true } })[0],
    );
  });
});
