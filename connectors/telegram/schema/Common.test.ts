import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  botTokenGuard,
  chatIdGuard,
  ChatSchemaObject,
  MessageSchemaObject,
} from './Common.ts';

describe('Telegram.schema.Common', () => {
  describe('chatIdGuard', () => {
    it('accepts an integer chat id', () => {
      const [error, value] = chatIdGuard.safeParse(123456789);
      asserts.assertEquals(error, null);
      asserts.assertEquals(value, 123456789);
    });

    it('accepts a negative group chat id', () => {
      asserts.assertEquals(chatIdGuard.safeParse(-1001234567890)[0], null);
    });

    it('accepts an @username string', () => {
      const [error, value] = chatIdGuard.safeParse('@examplechannel');
      asserts.assertEquals(error, null);
      asserts.assertEquals(value, '@examplechannel');
    });

    it('preserves a numeric string as a string, rather than coercing it to a number', () => {
      // Regression test: `Guardian.number()` coerces numeric strings by
      // default, and `oneOf` tries its guards in order, so without
      // `.strict()` on the number branch a purely-numeric string would
      // always resolve through the number branch first — silently
      // returning a `number` even though a `string` was passed in.
      // `.strict()` blocks that coercion, so the number branch correctly
      // fails and the string branch matches instead, preserving the
      // original type.
      const [error, value] = chatIdGuard.safeParse('123456789');
      asserts.assertEquals(error, null);
      asserts.assertEquals(value, '123456789');
      asserts.assertEquals(typeof value, 'string');
    });

    it('rejects an empty string', () => {
      asserts.assertExists(chatIdGuard.safeParse('')[0]);
    });

    it('rejects a non-integer number', () => {
      asserts.assertExists(chatIdGuard.safeParse(123.45)[0]);
    });

    it('rejects a value that is neither a number nor a string', () => {
      // `chatIdGuard`'s number branch uses `.strict()`, which never
      // coerces — so a plain object or a boolean (which a non-strict
      // number guard would otherwise coerce) reliably exercises the
      // rejection path on both branches.
      asserts.assertExists(chatIdGuard.safeParse({})[0]);
      asserts.assertExists(chatIdGuard.safeParse(true)[0]);
    });
  });

  describe('botTokenGuard', () => {
    it('accepts a well-formed bot token', () => {
      const [error, value] = botTokenGuard.safeParse(
        '123456789:AAExampleTokenAABBCCDDEEFFGGHHIIJJKKLLMM',
      );
      asserts.assertEquals(error, null);
      asserts.assertEquals(
        value,
        '123456789:AAExampleTokenAABBCCDDEEFFGGHHIIJJKKLLMM',
      );
    });

    it('rejects an empty string', () => {
      asserts.assertExists(botTokenGuard.safeParse('')[0]);
    });

    it('rejects a token with no colon separator', () => {
      asserts.assertExists(
        botTokenGuard.safeParse('123456789AAExampleTokenAABB')[0],
      );
    });

    it('rejects a token with a non-numeric bot id prefix', () => {
      asserts.assertExists(
        botTokenGuard.safeParse('notanumber:AAExampleTokenAABB')[0],
      );
    });

    it('rejects a token with an empty secret portion', () => {
      asserts.assertExists(botTokenGuard.safeParse('123456789:')[0]);
    });

    it('rejects a pasted URL by mistake', () => {
      asserts.assertExists(
        botTokenGuard.safeParse('https://t.me/BotFather')[0],
      );
    });

    it('rejects a token with embedded whitespace', () => {
      asserts.assertExists(
        botTokenGuard.safeParse('123456789: AAExample Token')[0],
      );
    });
  });

  describe('ChatSchemaObject', () => {
    it('accepts a private chat', () => {
      const [error, chat] = ChatSchemaObject.safeParse({
        id: 123456789,
        type: 'private',
        first_name: 'Ada',
        username: 'ada',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(chat?.type, 'private');
    });

    it('accepts a supergroup chat with only a title', () => {
      asserts.assertEquals(
        ChatSchemaObject.safeParse({
          id: -1001234567890,
          type: 'supergroup',
          title: 'Example Group',
        })[0],
        null,
      );
    });

    it('keeps unmodeled fields via passthrough', () => {
      const [error, chat] = ChatSchemaObject.safeParse({
        id: 1,
        type: 'channel',
        title: 'Example Channel',
        invite_link: 'https://t.me/example',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(
        (chat as Record<string, unknown>)?.invite_link,
        'https://t.me/example',
      );
    });

    it('rejects an undocumented chat type', () => {
      asserts.assertExists(
        ChatSchemaObject.safeParse({ id: 1, type: 'forum' })[0],
      );
    });
  });

  describe('MessageSchemaObject', () => {
    it('accepts a plain text message', () => {
      const [error, message] = MessageSchemaObject.safeParse({
        message_id: 1,
        date: 1735689600,
        chat: { id: 123456789, type: 'private', first_name: 'Ada' },
        text: 'Hello!',
        from: {
          id: 987654321,
          is_bot: true,
          first_name: 'ExampleBot',
          username: 'example_bot',
        },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(message?.text, 'Hello!');
      asserts.assertEquals(message?.chat.type, 'private');
      asserts.assertEquals(message?.from?.username, 'example_bot');
    });

    it('accepts a message without `from` (anonymous channel post)', () => {
      asserts.assertEquals(
        MessageSchemaObject.safeParse({
          message_id: 2,
          date: 1735689600,
          chat: { id: -100123, type: 'channel', title: 'Example Channel' },
          text: 'Announcement',
        })[0],
        null,
      );
    });

    it('keeps unmodeled fields via passthrough', () => {
      const [error, message] = MessageSchemaObject.safeParse({
        message_id: 3,
        date: 1735689600,
        chat: { id: 1, type: 'private', first_name: 'Ada' },
        photo: [{ file_id: 'abc', width: 90, height: 90 }],
      });
      asserts.assertEquals(error, null);
      asserts.assertExists((message as Record<string, unknown>)?.photo);
    });

    it('rejects a message missing required fields', () => {
      asserts.assertExists(
        MessageSchemaObject.safeParse({ message_id: 1 })[0],
      );
    });
  });
});
