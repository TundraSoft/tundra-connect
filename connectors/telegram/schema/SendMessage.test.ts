import * as asserts from '@asserts';
import { describe, it } from '@test';
import { SendMessageRequestSchemaObject } from './SendMessage.ts';

describe('Telegram.schema.SendMessage', () => {
  it('accepts the minimal required fields', () => {
    const [error, request] = SendMessageRequestSchemaObject.safeParse({
      chat_id: 123456789,
      text: 'Hello!',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(request?.chat_id, 123456789);
    asserts.assertEquals(request?.text, 'Hello!');
  });

  it('accepts an @username chat_id', () => {
    asserts.assertEquals(
      SendMessageRequestSchemaObject.safeParse({
        chat_id: '@examplechannel',
        text: 'Announcement',
      })[0],
      null,
    );
  });

  it('accepts a full set of documented optional fields', () => {
    const [error, request] = SendMessageRequestSchemaObject.safeParse({
      chat_id: 123456789,
      text: '*Hello* from Telegram\\!',
      parse_mode: 'MarkdownV2',
      disable_notification: true,
      protect_content: true,
      message_thread_id: 42,
      reply_parameters: { message_id: 10 },
      reply_markup: {
        inline_keyboard: [[{ text: 'Open', url: 'https://example.com' }]],
      },
      link_preview_options: { is_disabled: true },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(request?.parse_mode, 'MarkdownV2');
    asserts.assertEquals(request?.disable_notification, true);
  });

  it('rejects a missing chat_id', () => {
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({ text: 'Hello!' })[0],
    );
  });

  it('rejects an empty text', () => {
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({
        chat_id: 1,
        text: '',
      })[0],
    );
  });

  it('rejects text over 4096 characters', () => {
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({
        chat_id: 1,
        text: 'a'.repeat(4097),
      })[0],
    );
  });

  it('rejects an undocumented parse_mode', () => {
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({
        chat_id: 1,
        text: 'Hello',
        parse_mode: 'Markdown3',
      })[0],
    );
  });

  it('accepts the legacy Markdown parse_mode', () => {
    asserts.assertEquals(
      SendMessageRequestSchemaObject.safeParse({
        chat_id: 1,
        text: 'Hello',
        parse_mode: 'Markdown',
      })[0],
      null,
    );
  });
});
