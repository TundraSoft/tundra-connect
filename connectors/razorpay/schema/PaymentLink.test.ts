import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CreatePaymentLinkRequestSchemaObject,
  PaymentLinkSchemaObject,
} from './PaymentLink.ts';

const validPaymentLink = {
  id: 'plink_JXPUQu6ftD5WLu',
  short_url: 'https://rzp.io/i/nxrHnLJ',
  status: 'created',
  amount: 29900,
  amount_paid: 0,
  currency: 'INR',
  created_at: 1600188707,
  expire_by: null,
};

describe('Razorpay.schema.PaymentLink', () => {
  describe('CreatePaymentLinkRequestSchemaObject', () => {
    it('accepts a minimal create request (amount only)', () => {
      const [error, parsed] = CreatePaymentLinkRequestSchemaObject.safeParse({
        amount: 29900,
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(parsed?.amount, 29900);
    });

    it('accepts a full create request', () => {
      const [error, parsed] = CreatePaymentLinkRequestSchemaObject.safeParse({
        amount: 29900,
        currency: 'INR',
        description: 'Payment for order #1',
        customer: {
          name: 'Gaurav Kumar',
          contact: '+919876543210',
          email: 'gaurav.kumar@example.com',
        },
        notify: { sms: true, email: true },
        reminder_enable: true,
        callback_url: 'https://example.com/callback',
        callback_method: 'get',
        accept_partial: true,
        first_min_partial_amount: 100,
        reference_id: 'ref-1',
        expire_by: 1600188707,
        notes: { orderId: '1234' },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(parsed?.customer?.name, 'Gaurav Kumar');
    });

    it('rejects a request missing amount', () => {
      asserts.assertExists(
        CreatePaymentLinkRequestSchemaObject.safeParse({})[0],
      );
    });

    it('rejects a non-integer amount', () => {
      asserts.assertExists(
        CreatePaymentLinkRequestSchemaObject.safeParse({ amount: 299.5 })[0],
      );
    });

    it("rejects callback_method values other than 'get'", () => {
      asserts.assertExists(
        CreatePaymentLinkRequestSchemaObject.safeParse({
          amount: 29900,
          callback_url: 'https://example.com/callback',
          callback_method: 'post',
        })[0],
      );
    });

    it('rejects a reference_id over 40 characters', () => {
      asserts.assertExists(
        CreatePaymentLinkRequestSchemaObject.safeParse({
          amount: 29900,
          reference_id: 'r'.repeat(41),
        })[0],
      );
    });

    it('rejects a description over 2048 characters', () => {
      asserts.assertExists(
        CreatePaymentLinkRequestSchemaObject.safeParse({
          amount: 29900,
          description: 'd'.repeat(2049),
        })[0],
      );
    });
  });

  describe('PaymentLinkSchemaObject', () => {
    it('parses a valid Payment Link response', () => {
      const [error, link] = PaymentLinkSchemaObject.safeParse(
        validPaymentLink,
      );
      asserts.assertEquals(error, null);
      asserts.assertEquals(link?.id, validPaymentLink.id);
      asserts.assertEquals(link?.status, 'created');
    });

    it('accepts a response with a populated customer/notify/notes', () => {
      const [error, link] = PaymentLinkSchemaObject.safeParse({
        ...validPaymentLink,
        customer: { name: 'Gaurav Kumar' },
        notify: { sms: true },
        notes: { orderId: '1234' },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(link?.customer?.name, 'Gaurav Kumar');
    });

    it('rejects an undocumented status', () => {
      asserts.assertExists(
        PaymentLinkSchemaObject.safeParse({
          ...validPaymentLink,
          status: 'bogus',
        })[0],
      );
    });

    it('rejects a response missing a required field', () => {
      const { id: _id, ...withoutId } = validPaymentLink;
      asserts.assertExists(PaymentLinkSchemaObject.safeParse(withoutId)[0]);
    });

    it('keeps unmodeled fields via passthrough', () => {
      const [error, link] = PaymentLinkSchemaObject.safeParse({
        ...validPaymentLink,
        user_id: 'acc_abc123',
      });
      asserts.assertEquals(error, null);
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals((link as any).user_id, 'acc_abc123');
    });
  });
});
