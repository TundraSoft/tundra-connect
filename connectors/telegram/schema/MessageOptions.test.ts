import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  LinkPreviewOptionsSchemaObject,
  ReplyParametersSchemaObject,
} from './MessageOptions.ts';

describe('Telegram.schema.MessageOptions', () => {
  describe('LinkPreviewOptionsSchemaObject', () => {
    it('accepts the documented fields', () => {
      asserts.assertEquals(
        LinkPreviewOptionsSchemaObject.safeParse({
          is_disabled: false,
          url: 'https://example.com',
          prefer_large_media: true,
          show_above_text: true,
        })[0],
        null,
      );
    });

    it('rejects an unknown key instead of dropping it', () => {
      const [error] = LinkPreviewOptionsSchemaObject.safeParse({
        is_disable: true,
      });
      asserts.assertExists(error);
      asserts.assertStringIncludes(error.message, 'is_disable');
    });

    it('does not coerce a string boolean', () => {
      asserts.assertExists(
        LinkPreviewOptionsSchemaObject.safeParse({ is_disabled: 'true' })[0],
      );
    });
  });

  describe('ReplyParametersSchemaObject', () => {
    it('accepts a reply by message_id', () => {
      const [error, reply] = ReplyParametersSchemaObject.safeParse({
        message_id: 42,
        allow_sending_without_reply: true,
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(reply?.message_id, 42);
    });

    it('accepts a cross-chat reply with a quote', () => {
      asserts.assertEquals(
        ReplyParametersSchemaObject.safeParse({
          message_id: 42,
          chat_id: '@examplechannel',
          quote: 'exact words',
        })[0],
        null,
      );
    });

    it('requires message_id or ephemeral_message_id', () => {
      asserts.assertExists(
        ReplyParametersSchemaObject.safeParse({ chat_id: 1 })[0],
      );
      asserts.assertEquals(
        ReplyParametersSchemaObject.safeParse({ ephemeral_message_id: 3 })[0],
        null,
      );
    });

    it('rejects a quote over 1024 characters and a numeric-string message_id', () => {
      asserts.assertExists(
        ReplyParametersSchemaObject.safeParse({
          message_id: 1,
          quote: 'q'.repeat(1025),
        })[0],
      );
      asserts.assertExists(
        ReplyParametersSchemaObject.safeParse({ message_id: '42' })[0],
      );
    });
  });
});
