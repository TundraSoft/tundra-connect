import * as asserts from '@asserts';
import { describe, it } from '@test';
import { DeleteMessageRequestSchemaObject } from './DeleteMessage.ts';

describe('Telegram.schema.DeleteMessage', () => {
  it('accepts a chat id and message id', () => {
    asserts.assertEquals(
      DeleteMessageRequestSchemaObject.safeParse({
        chat_id: -1001234567890,
        message_id: 42,
      })[0],
      null,
    );
    asserts.assertEquals(
      DeleteMessageRequestSchemaObject.safeParse({
        chat_id: '@examplechannel',
        message_id: 42,
      })[0],
      null,
    );
  });

  it('rejects a missing message_id, a numeric string, and unknown keys', () => {
    for (
      const body of [
        { chat_id: 1 },
        { chat_id: 1, message_id: '42' },
        { chat_id: 1, message_id: 42, revoke: true },
      ]
    ) {
      asserts.assertExists(
        DeleteMessageRequestSchemaObject.safeParse(body)[0],
        JSON.stringify(body),
      );
    }
  });
});
