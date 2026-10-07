import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ForceReplySchemaObject,
  InlineKeyboardButtonSchemaObject,
  InlineKeyboardMarkupSchemaObject,
  KeyboardButtonSchemaObject,
  ReplyKeyboardMarkupSchemaObject,
  ReplyKeyboardRemoveSchemaObject,
  ReplyMarkupSchemaObject,
} from './Keyboard.ts';

const button = (fields: Record<string, unknown>) =>
  InlineKeyboardButtonSchemaObject.safeParse({ text: 'Go', ...fields });

describe('Telegram.schema.Keyboard', () => {
  describe('InlineKeyboardButtonSchemaObject', () => {
    it('accepts a url button', () => {
      asserts.assertEquals(button({ url: 'https://example.com/a' })[0], null);
    });

    it('accepts a tg:// url button', () => {
      asserts.assertEquals(button({ url: 'tg://user?id=42' })[0], null);
    });

    it('rejects a url with another scheme', () => {
      asserts.assertExists(button({ url: 'ftp://example.com' })[0]);
    });

    it('accepts a callback_data button', () => {
      const [error, value] = button({ callback_data: 'ack:42' });
      asserts.assertEquals(error, null);
      asserts.assertEquals(value?.callback_data, 'ack:42');
    });

    it('accepts the other single-action buttons', () => {
      for (
        const fields of [
          { web_app: { url: 'https://example.com/app' } },
          { login_url: { url: 'https://example.com/login' } },
          { switch_inline_query: '' },
          { switch_inline_query_current_chat: 'q' },
          { switch_inline_query_chosen_chat: { allow_user_chats: true } },
          { copy_text: { text: 'ABC-123' } },
          { callback_game: {} },
          { pay: true },
        ]
      ) {
        asserts.assertEquals(button(fields)[0], null, JSON.stringify(fields));
      }
    });

    it('rejects a button with no action', () => {
      const [error] = button({});
      asserts.assertExists(error);
      asserts.assertStringIncludes(error.message, 'exactly one of');
    });

    it('rejects a button with two actions', () => {
      asserts.assertExists(
        button({ url: 'https://example.com', callback_data: 'x' })[0],
      );
    });

    it('does not count style and icon_custom_emoji_id as actions', () => {
      asserts.assertEquals(
        button({
          style: 'danger',
          icon_custom_emoji_id: '5368324170671202286',
          callback_data: 'delete:1',
        })[0],
        null,
      );
      asserts.assertExists(button({ style: 'danger' })[0]);
    });

    it('rejects an undocumented style', () => {
      asserts.assertExists(button({ style: 'warning', callback_data: 'x' })[0]);
    });

    it('rejects an unknown key (strict)', () => {
      const [error] = button({ callback: 'x' });
      asserts.assertExists(error);
    });

    it('rejects an empty label', () => {
      asserts.assertExists(
        InlineKeyboardButtonSchemaObject.safeParse({
          text: '',
          callback_data: 'x',
        })[0],
      );
    });

    describe('callback_data byte limit', () => {
      it('accepts exactly 64 ASCII bytes', () => {
        asserts.assertEquals(
          button({ callback_data: 'a'.repeat(64) })[0],
          null,
        );
      });

      it('rejects 65 ASCII bytes', () => {
        const [error] = button({ callback_data: 'a'.repeat(65) });
        asserts.assertExists(error);
      });

      it('rejects an empty string', () => {
        asserts.assertExists(button({ callback_data: '' })[0]);
      });

      it('counts two-byte characters as two bytes', () => {
        // 'ж' is 2 bytes in UTF-8: 32 of them are 64 bytes, 33 are 66.
        asserts.assertEquals(
          button({ callback_data: 'ж'.repeat(32) })[0],
          null,
        );
        asserts.assertExists(button({ callback_data: 'ж'.repeat(33) })[0]);
      });

      it('counts emoji as four bytes, not one character', () => {
        // 17 emoji are 17 code points and 34 UTF-16 units, but 68 bytes.
        asserts.assertEquals(
          button({ callback_data: '😀'.repeat(16) })[0],
          null,
        );
        asserts.assertExists(button({ callback_data: '😀'.repeat(17) })[0]);
      });
    });
  });

  describe('InlineKeyboardMarkupSchemaObject', () => {
    it('accepts rows of url and callback buttons', () => {
      const [error, markup] = InlineKeyboardMarkupSchemaObject.safeParse({
        inline_keyboard: [
          [
            { text: 'Open', url: 'https://example.com' },
            { text: 'Ack', callback_data: 'ack:1' },
          ],
          [{ text: 'Mute', callback_data: 'mute:3600' }],
        ],
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(markup?.inline_keyboard.length, 2);
    });

    it('rejects a keyboard containing one invalid button', () => {
      asserts.assertExists(
        InlineKeyboardMarkupSchemaObject.safeParse({
          inline_keyboard: [[{ text: 'Broken' }]],
        })[0],
      );
    });

    it('rejects a missing inline_keyboard', () => {
      asserts.assertExists(InlineKeyboardMarkupSchemaObject.safeParse({})[0]);
    });
  });

  describe('KeyboardButtonSchemaObject', () => {
    it('accepts a text button and a location request', () => {
      asserts.assertEquals(
        KeyboardButtonSchemaObject.safeParse({ text: '/status' })[0],
        null,
      );
      asserts.assertEquals(
        KeyboardButtonSchemaObject.safeParse({
          text: 'Share location',
          request_location: true,
        })[0],
        null,
      );
    });

    it('rejects two request actions on one button', () => {
      asserts.assertExists(
        KeyboardButtonSchemaObject.safeParse({
          text: 'Both',
          request_contact: true,
          request_location: true,
        })[0],
      );
    });

    it('does not coerce a string boolean', () => {
      asserts.assertExists(
        KeyboardButtonSchemaObject.safeParse({
          text: 'x',
          request_contact: 'true',
        })[0],
      );
    });
  });

  describe('ReplyKeyboardMarkupSchemaObject', () => {
    it('accepts plain-string and object buttons', () => {
      asserts.assertEquals(
        ReplyKeyboardMarkupSchemaObject.safeParse({
          keyboard: [['/today', { text: '/week' }]],
          resize_keyboard: true,
          input_field_placeholder: 'Pick a report',
        })[0],
        null,
      );
    });

    it('rejects an empty string button and a 65-character placeholder', () => {
      asserts.assertExists(
        ReplyKeyboardMarkupSchemaObject.safeParse({ keyboard: [['']] })[0],
      );
      asserts.assertExists(
        ReplyKeyboardMarkupSchemaObject.safeParse({
          keyboard: [['a']],
          input_field_placeholder: 'x'.repeat(65),
        })[0],
      );
    });
  });

  describe('ReplyKeyboardRemove / ForceReply', () => {
    it('accept their literal-true flag only', () => {
      asserts.assertEquals(
        ReplyKeyboardRemoveSchemaObject.safeParse({ remove_keyboard: true })[0],
        null,
      );
      asserts.assertExists(
        ReplyKeyboardRemoveSchemaObject.safeParse({
          remove_keyboard: false,
        })[0],
      );
      asserts.assertEquals(
        ForceReplySchemaObject.safeParse({ force_reply: true })[0],
        null,
      );
      asserts.assertExists(
        ForceReplySchemaObject.safeParse({ force_reply: 'true' })[0],
      );
    });
  });

  describe('ReplyMarkupSchemaObject', () => {
    it('accepts each of the four shapes', () => {
      for (
        const markup of [
          { inline_keyboard: [[{ text: 'a', callback_data: 'a' }]] },
          { keyboard: [['a']] },
          { remove_keyboard: true },
          { force_reply: true, selective: true },
        ]
      ) {
        asserts.assertEquals(
          ReplyMarkupSchemaObject.safeParse(markup)[0],
          null,
          JSON.stringify(markup),
        );
      }
    });

    it('rejects anything else, keeping each branch failure in toJSON()', () => {
      const [error] = ReplyMarkupSchemaObject.safeParse({
        inline_keyboard: [[{ text: 'a', callback_data: 'x'.repeat(65) }]],
      });
      asserts.assertExists(error);
      asserts.assertStringIncludes(
        JSON.stringify(error.toJSON()),
        'callback_data must be 1-64 bytes',
      );
    });
  });
});
