import * as asserts from '@asserts';
import { describe, it } from '@test';
import { WebhookEventSchemaObject } from './WebhookEvent.ts';

describe('Resend.schema.WebhookEvent', () => {
  it('accepts an email event', () => {
    const [error, value] = WebhookEventSchemaObject.safeParse({
      type: 'email.bounced',
      created_at: '2026-02-22T23:41:12.126Z',
      data: {
        email_id: '56761188-7520-42d8-8898-ff6fc54ce618',
        to: ['someone@example.com'],
        bounce: { type: 'Permanent' },
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.type, 'email.bounced');
  });

  it('rejects a payload without type or data', () => {
    asserts.assertExists(
      WebhookEventSchemaObject.safeParse({ created_at: 'x', data: {} })[0],
    );
    asserts.assertExists(
      WebhookEventSchemaObject.safeParse({
        type: 'email.sent',
        created_at: 'x',
      })[0],
    );
  });

  it('rejects an empty type', () => {
    const [error] = WebhookEventSchemaObject.safeParse({
      type: '',
      created_at: 'x',
      data: {},
    });
    asserts.assertExists(error);
  });
});
