import * as asserts from '@asserts';
import { describe, it } from '@test';
import { EmailSchemaObject } from './Email.ts';

const EMAIL = {
  object: 'email',
  id: '4ef9a417-02e9-4d39-ad75-9611e0fcc33c',
  message_id: '<111-222-333@email.example.com>',
  to: ['delivered@resend.dev'],
  from: 'Acme <onboarding@resend.dev>',
  created_at: '2026-04-03 22:13:42.674981+00',
  subject: 'Hello World',
  html: 'Congrats on sending your <strong>first email</strong>!',
  text: null,
  bcc: [],
  cc: [],
  reply_to: [],
  last_event: 'delivered',
  scheduled_at: null,
  tags: [{ name: 'category', value: 'confirm_email' }],
};

describe('Resend.schema.Email', () => {
  it("accepts Resend's documented example", () => {
    const [error, value] = EmailSchemaObject.safeParse(EMAIL);
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.last_event, 'delivered');
    asserts.assertEquals(value?.text, null);
  });

  it('accepts nulls for the nullable list fields', () => {
    const [error] = EmailSchemaObject.safeParse({
      ...EMAIL,
      cc: null,
      bcc: null,
      reply_to: null,
      tags: null,
    });
    asserts.assertEquals(error, null);
  });

  it('accepts an unknown future last_event and additive fields', () => {
    const [error, value] = EmailSchemaObject.safeParse({
      ...EMAIL,
      last_event: 'brand_new_event',
      extra: 1,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.last_event, 'brand_new_event');
  });

  it('rejects a record without an id or last_event', () => {
    const { id: _id, ...noId } = EMAIL;
    const { last_event: _e, ...noEvent } = EMAIL;
    asserts.assertExists(EmailSchemaObject.safeParse(noId)[0]);
    asserts.assertExists(EmailSchemaObject.safeParse(noEvent)[0]);
  });
});
