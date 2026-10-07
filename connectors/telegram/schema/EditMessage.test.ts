import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  EditMessageReplyMarkupRequestSchemaObject,
  EditMessageResultSchemaObject,
  EditMessageTextRequestSchemaObject,
} from './EditMessage.ts';

const MESSAGE = {
  message_id: 42,
  date: 1735689600,
  edit_date: 1735689700,
  chat: { id: 1, type: 'private', first_name: 'Ada' },
  text: 'Edited',
};

describe('Telegram.schema.EditMessage', () => {
  describe('EditMessageTextRequestSchemaObject', () => {
    it('accepts a chat_id + message_id target', () => {
      const [error, request] = EditMessageTextRequestSchemaObject.safeParse({
        chat_id: 1,
        message_id: 42,
        text: 'Resolved',
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(request?.text, 'Resolved');
    });

    it('accepts an inline_message_id target', () => {
      asserts.assertEquals(
        EditMessageTextRequestSchemaObject.safeParse({
          inline_message_id: 'AAAAAgAAAB',
          text: 'Resolved',
        })[0],
        null,
      );
    });

    it('rejects no target, a half target, and both targets', () => {
      for (
        const target of [
          {},
          { chat_id: 1 },
          { message_id: 42 },
          { chat_id: 1, message_id: 42, inline_message_id: 'AAA' },
          { message_id: 42, inline_message_id: 'AAA' },
        ]
      ) {
        asserts.assertExists(
          EditMessageTextRequestSchemaObject.safeParse({
            ...target,
            text: 'x',
          })[0],
          JSON.stringify(target),
        );
      }
    });

    it('rejects a reply keyboard: edits accept inline keyboards only', () => {
      asserts.assertExists(
        EditMessageTextRequestSchemaObject.safeParse({
          chat_id: 1,
          message_id: 42,
          text: 'x',
          reply_markup: { keyboard: [['a']] },
        })[0],
      );
    });

    it('applies the 4096 text limit', () => {
      asserts.assertExists(
        EditMessageTextRequestSchemaObject.safeParse({
          chat_id: 1,
          message_id: 42,
          text: 'a'.repeat(4097),
        })[0],
      );
    });
  });

  describe('EditMessageReplyMarkupRequestSchemaObject', () => {
    it('accepts a target with no reply_markup (removes the keyboard)', () => {
      asserts.assertEquals(
        EditMessageReplyMarkupRequestSchemaObject.safeParse({
          chat_id: 1,
          message_id: 42,
        })[0],
        null,
      );
    });

    it('rejects an unknown key', () => {
      asserts.assertExists(
        EditMessageReplyMarkupRequestSchemaObject.safeParse({
          chat_id: 1,
          message_id: 42,
          text: 'not allowed here',
        })[0],
      );
    });
  });

  describe('EditMessageResultSchemaObject', () => {
    it('accepts the edited Message', () => {
      const [error, result] = EditMessageResultSchemaObject.safeParse(MESSAGE);
      asserts.assertEquals(error, null);
      asserts.assert(result !== true && result?.message_id === 42);
    });

    it('accepts true, for an inline message', () => {
      const [error, result] = EditMessageResultSchemaObject.safeParse(true);
      asserts.assertEquals(error, null);
      asserts.assertEquals(result, true);
    });

    it('rejects false and other values', () => {
      asserts.assertExists(EditMessageResultSchemaObject.safeParse(false)[0]);
      asserts.assertExists(EditMessageResultSchemaObject.safeParse('true')[0]);
    });
  });
});
