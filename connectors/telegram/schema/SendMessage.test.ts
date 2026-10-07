import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  MESSAGE_TEXT_MAX_LENGTH,
  SendMessageRequestSchemaObject,
} from './SendMessage.ts';

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
  it('counts text length in UTF-16 code units, as Telegram does', () => {
    // Each emoji is two UTF-16 code units: 2048 of them are exactly 4096.
    asserts.assertEquals('😀'.length, 2);
    asserts.assertEquals(
      SendMessageRequestSchemaObject.safeParse({
        chat_id: 1,
        text: '😀'.repeat(MESSAGE_TEXT_MAX_LENGTH / 2),
      })[0],
      null,
    );
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({
        chat_id: 1,
        text: '😀'.repeat(MESSAGE_TEXT_MAX_LENGTH / 2) + 'a',
      })[0],
    );
  });

  it('rejects an unknown key instead of silently dropping it (strict)', () => {
    const [error] = SendMessageRequestSchemaObject.safeParse({
      chat_id: 1,
      text: 'Hello',
      disable_notifications: true,
    });
    asserts.assertExists(error);
    asserts.assertStringIncludes(error.message, 'disable_notifications');
  });

  it('does not coerce a string boolean or a numeric-string thread id', () => {
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({
        chat_id: 1,
        text: 'Hello',
        disable_notification: 'true',
      })[0],
    );
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({
        chat_id: 1,
        text: 'Hello',
        message_thread_id: '7',
      })[0],
    );
  });

  it('accepts the legacy disable_web_page_preview on its own', () => {
    asserts.assertEquals(
      SendMessageRequestSchemaObject.safeParse({
        chat_id: 1,
        text: 'https://example.com',
        disable_web_page_preview: true,
      })[0],
      null,
    );
  });

  it('refuses disable_web_page_preview together with link_preview_options', () => {
    const [error] = SendMessageRequestSchemaObject.safeParse({
      chat_id: 1,
      text: 'https://example.com',
      disable_web_page_preview: true,
      link_preview_options: { is_disabled: true },
    });
    asserts.assertExists(error);
  });

  it('accepts each reply_markup shape', () => {
    for (
      const reply_markup of [
        {
          inline_keyboard: [[
            { text: 'Open', url: 'https://example.com' },
            { text: 'Ack', callback_data: 'ack:1' },
          ]],
        },
        { keyboard: [['/today', '/week']], one_time_keyboard: true },
        { remove_keyboard: true },
        { force_reply: true },
      ]
    ) {
      asserts.assertEquals(
        SendMessageRequestSchemaObject.safeParse({
          chat_id: 1,
          text: 'Pick one',
          reply_markup,
        })[0],
        null,
        JSON.stringify(reply_markup),
      );
    }
  });

  it('rejects an inline button with two actions', () => {
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({
        chat_id: 1,
        text: 'Pick one',
        reply_markup: {
          inline_keyboard: [[{
            text: 'Both',
            url: 'https://example.com',
            callback_data: 'x',
          }]],
        },
      })[0],
    );
  });

  it('rejects reply_parameters without a message to reply to', () => {
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({
        chat_id: 1,
        text: 'Hello',
        reply_parameters: { allow_sending_without_reply: true },
      })[0],
    );
  });
});
