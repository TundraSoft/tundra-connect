import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CapturePaymentRequestSchemaObject,
  paymentIdGuard,
  PaymentSchemaObject,
} from './Payment.ts';

const validPayment = {
  id: 'pay_29QQoUBi66xm2f',
  entity: 'payment',
  amount: 29900,
  currency: 'INR',
  status: 'captured',
  order_id: 'order_EKwxwAgItmmXdp',
  invoice_id: null,
  international: false,
  method: 'card',
  amount_refunded: 0,
  refund_status: null,
  captured: true,
  description: 'Order #1',
  email: 'gaurav.kumar@example.com',
  contact: '+919876543210',
  notes: {},
  fee: 590,
  tax: 90,
  error_code: null,
  error_description: null,
  error_source: null,
  error_step: null,
  error_reason: null,
  created_at: 1582637108,
};

describe('Razorpay.schema.Payment', () => {
  describe('paymentIdGuard', () => {
    it('accepts a valid payment id', () => {
      asserts.assertEquals(
        paymentIdGuard.safeParse('pay_29QQoUBi66xm2f')[0],
        null,
      );
    });

    it('rejects an id with the wrong prefix', () => {
      asserts.assertExists(paymentIdGuard.safeParse('order_29QQoUBi66xm2f')[0]);
    });
  });

  describe('CapturePaymentRequestSchemaObject', () => {
    it('accepts a valid capture request', () => {
      const [error, parsed] = CapturePaymentRequestSchemaObject.safeParse({
        amount: 29900,
        currency: 'INR',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(parsed?.amount, 29900);
    });

    it('rejects a request missing amount', () => {
      asserts.assertExists(
        CapturePaymentRequestSchemaObject.safeParse({ currency: 'INR' })[0],
      );
    });

    it('rejects a request missing currency', () => {
      asserts.assertExists(
        CapturePaymentRequestSchemaObject.safeParse({ amount: 29900 })[0],
      );
    });

    it('rejects a non-integer amount', () => {
      asserts.assertExists(
        CapturePaymentRequestSchemaObject.safeParse({
          amount: 299.5,
          currency: 'INR',
        })[0],
      );
    });
  });

  describe('PaymentSchemaObject', () => {
    it('parses a valid Payment response', () => {
      const [error, payment] = PaymentSchemaObject.safeParse(validPayment);
      asserts.assertEquals(error, null);
      asserts.assertEquals(payment?.id, validPayment.id);
      asserts.assertEquals(payment?.status, 'captured');
    });

    it('accepts a failed payment with populated error fields', () => {
      const [error, payment] = PaymentSchemaObject.safeParse({
        ...validPayment,
        status: 'failed',
        captured: false,
        error_code: 'BAD_REQUEST_ERROR',
        error_description: 'Payment failed',
        error_source: 'customer',
        error_step: 'payment_authentication',
        error_reason: 'payment_failed',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(payment?.error_code, 'BAD_REQUEST_ERROR');
    });

    it('accepts a UPI payment with only `vpa` populated', () => {
      const [error, payment] = PaymentSchemaObject.safeParse({
        ...validPayment,
        method: 'upi',
        vpa: 'gaurav.kumar@okhdfcbank',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(payment?.vpa, 'gaurav.kumar@okhdfcbank');
      asserts.assertEquals(payment?.card_id, undefined);
    });

    it('normalizes a `notes: []` response quirk to `{}`', () => {
      const [error, payment] = PaymentSchemaObject.safeParse({
        ...validPayment,
        notes: [],
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(payment?.notes, {});
    });

    it('rejects an undocumented status', () => {
      asserts.assertExists(
        PaymentSchemaObject.safeParse({ ...validPayment, status: 'bogus' })[0],
      );
    });

    it('rejects a response missing a required field', () => {
      const { id: _id, ...withoutId } = validPayment;
      asserts.assertExists(PaymentSchemaObject.safeParse(withoutId)[0]);
    });

    it('keeps unmodeled fields via passthrough', () => {
      const [error, payment] = PaymentSchemaObject.safeParse({
        ...validPayment,
        acquirer_data: { rrn: '123456789012' },
      });
      asserts.assertEquals(error, null);
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals((payment as any).acquirer_data.rrn, '123456789012');
    });
  });
});
