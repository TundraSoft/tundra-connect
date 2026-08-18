import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  RazorpayErrorDetailSchemaObject,
  RazorpayErrorEnvelopeSchemaObject,
} from './Error.ts';

describe('Razorpay.schema.Error', () => {
  describe('RazorpayErrorDetailSchemaObject', () => {
    it('accepts a minimal error detail (code + description only)', () => {
      const [error, detail] = RazorpayErrorDetailSchemaObject.safeParse({
        code: 'BAD_REQUEST_ERROR',
        description: 'The amount must be at least INR 1.00',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(detail?.code, 'BAD_REQUEST_ERROR');
    });

    it('accepts a full error detail', () => {
      const [error, detail] = RazorpayErrorDetailSchemaObject.safeParse({
        code: 'BAD_REQUEST_ERROR',
        description: 'The amount must be at least INR 1.00',
        field: 'amount',
        source: 'business',
        step: 'payment_initiation',
        reason: 'input_validation_failed',
        metadata: { payment_id: 'pay_29QQoUBi66xm2f' },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(detail?.field, 'amount');
      asserts.assertEquals(detail?.source, 'business');
    });

    it('rejects a detail missing code', () => {
      asserts.assertExists(
        RazorpayErrorDetailSchemaObject.safeParse({
          description: 'missing code',
        })[0],
      );
    });

    it('rejects a detail missing description', () => {
      asserts.assertExists(
        RazorpayErrorDetailSchemaObject.safeParse({
          code: 'BAD_REQUEST_ERROR',
        })[0],
      );
    });
  });

  describe('RazorpayErrorEnvelopeSchemaObject', () => {
    it('accepts a documented error envelope', () => {
      const [error, envelope] = RazorpayErrorEnvelopeSchemaObject.safeParse({
        error: {
          code: 'GATEWAY_ERROR',
          description: 'The bank declined the request.',
        },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(envelope?.error.code, 'GATEWAY_ERROR');
    });

    it('rejects a body missing the error envelope', () => {
      asserts.assertExists(
        RazorpayErrorEnvelopeSchemaObject.safeParse({ oops: true })[0],
      );
    });
  });
});
