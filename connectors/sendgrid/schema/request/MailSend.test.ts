import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  AsmSchemaObject,
  MailContentSchemaObject,
  MailSendRequestSchemaObject,
} from './MailSend.ts';

const basePersonalization = { to: [{ email: 'dest@example.com' }] };
const baseFrom = { email: 'sender@example.com' };
const baseContent = [{ type: 'text/plain', value: 'Hi there!' }];

describe('SendGrid.schema.MailSend', () => {
  it('accepts a minimal content-based request', () => {
    const [error, request] = MailSendRequestSchemaObject.safeParse({
      personalizations: [basePersonalization],
      from: baseFrom,
      subject: 'Hello',
      content: baseContent,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(request?.from.email, 'sender@example.com');
    asserts.assertEquals(request?.personalizations.length, 1);
  });

  it('accepts a template-based request with neither subject nor content', () => {
    asserts.assertEquals(
      MailSendRequestSchemaObject.safeParse({
        personalizations: [basePersonalization],
        from: baseFrom,
        template_id: 'd-abc123',
      })[0],
      null,
    );
  });

  it('accepts a per-personalization subject with no top-level subject', () => {
    asserts.assertEquals(
      MailSendRequestSchemaObject.safeParse({
        personalizations: [{
          ...basePersonalization,
          subject: 'Per-recipient subject',
        }],
        from: baseFrom,
        content: baseContent,
      })[0],
      null,
    );
  });

  it('accepts a fully populated request', () => {
    const [error] = MailSendRequestSchemaObject.safeParse({
      personalizations: [basePersonalization],
      from: baseFrom,
      subject: 'Hello',
      content: baseContent,
      reply_to: { email: 'reply@example.com' },
      reply_to_list: [{ email: 'reply2@example.com' }],
      attachments: [{ content: 'aGVsbG8=', filename: 'hello.txt' }],
      headers: { 'X-Trace-Id': 'abc' },
      categories: ['newsletter', 'launch'],
      custom_args: { orderId: '1234' },
      send_at: 1_700_000_000,
      batch_id: 'batch-1',
      asm: { group_id: 1 },
      ip_pool_name: 'transactional',
      mail_settings: { sandbox_mode: { enable: true } },
      tracking_settings: { click_tracking: { enable: false } },
    });
    asserts.assertEquals(error, null);
  });

  it('rejects a request with no personalizations', () => {
    asserts.assertExists(
      MailSendRequestSchemaObject.safeParse({
        personalizations: [],
        from: baseFrom,
        subject: 'Hello',
        content: baseContent,
      })[0],
    );
  });

  it('rejects a request missing `from`', () => {
    asserts.assertExists(
      MailSendRequestSchemaObject.safeParse({
        personalizations: [basePersonalization],
        subject: 'Hello',
        content: baseContent,
      })[0],
    );
  });

  it('rejects a request with more than 10 categories', () => {
    asserts.assertExists(
      MailSendRequestSchemaObject.safeParse({
        personalizations: [basePersonalization],
        from: baseFrom,
        subject: 'Hello',
        content: baseContent,
        categories: Array.from({ length: 11 }, (_, i) => `cat-${i}`),
      })[0],
    );
  });

  it('rejects a request with neither subject nor template_id', () => {
    asserts.assertExists(
      MailSendRequestSchemaObject.safeParse({
        personalizations: [basePersonalization],
        from: baseFrom,
        content: baseContent,
      })[0],
    );
  });

  it('rejects a request where only some personalizations set a subject', () => {
    asserts.assertExists(
      MailSendRequestSchemaObject.safeParse({
        personalizations: [
          { ...basePersonalization, subject: 'Has one' },
          { to: [{ email: 'other@example.com' }] },
        ],
        from: baseFrom,
        content: baseContent,
      })[0],
    );
  });

  it('rejects a request with neither content nor template_id', () => {
    asserts.assertExists(
      MailSendRequestSchemaObject.safeParse({
        personalizations: [basePersonalization],
        from: baseFrom,
        subject: 'Hello',
      })[0],
    );
  });

  it('rejects a request with an empty content array and no template_id', () => {
    asserts.assertExists(
      MailSendRequestSchemaObject.safeParse({
        personalizations: [basePersonalization],
        from: baseFrom,
        subject: 'Hello',
        content: [],
      })[0],
    );
  });
});

describe('SendGrid.schema.MailSend.MailContent', () => {
  it('accepts a valid content part', () => {
    asserts.assertEquals(
      MailContentSchemaObject.safeParse({
        type: 'text/html',
        value: '<p>Hi</p>',
      })[0],
      null,
    );
  });

  it('rejects a malformed MIME type', () => {
    asserts.assertExists(
      MailContentSchemaObject.safeParse({ type: 'not-a-mime', value: 'Hi' })[0],
    );
  });
});

describe('SendGrid.schema.MailSend.Asm', () => {
  it('accepts a group id with additional groups to display', () => {
    asserts.assertEquals(
      AsmSchemaObject.safeParse({ group_id: 1, groups_to_display: [2, 3] })[0],
      null,
    );
  });

  it('rejects a non-positive group id', () => {
    asserts.assertExists(AsmSchemaObject.safeParse({ group_id: 0 })[0]);
  });

  it('rejects a missing group id', () => {
    asserts.assertExists(AsmSchemaObject.safeParse({})[0]);
  });
});
