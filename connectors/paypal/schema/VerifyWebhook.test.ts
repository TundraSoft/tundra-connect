import * as asserts from '@asserts';
import { describe, it } from '@test';
import { VerifyWebhookResponseSchemaObject } from './VerifyWebhook.ts';

describe('PayPal.schema.VerifyWebhook', () => {
  describe('VerifyWebhookResponseSchemaObject', () => {
    it('accepts both documented verdicts', () => {
      for (const status of ['SUCCESS', 'FAILURE'] as const) {
        const [error, result] = VerifyWebhookResponseSchemaObject.safeParse({
          verification_status: status,
        });
        asserts.assertEquals(error, null);
        asserts.assertEquals(result?.verification_status, status);
      }
    });

    it('keeps unmodeled vendor fields (passthrough)', () => {
      const [error, result] = VerifyWebhookResponseSchemaObject.safeParse({
        verification_status: 'SUCCESS',
        debug_id: 'abc123',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(
        (result as Record<string, unknown> | undefined)?.debug_id,
        'abc123',
      );
    });

    it('rejects an undocumented verdict — a verifier must never read it as success', () => {
      const [error] = VerifyWebhookResponseSchemaObject.safeParse({
        verification_status: 'PENDING',
      });
      asserts.assertExists(error);
    });

    it('rejects a body with no verdict at all', () => {
      const [error] = VerifyWebhookResponseSchemaObject.safeParse({});
      asserts.assertExists(error);
    });
  });
});
