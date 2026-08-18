import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ConversationHistoryRequestSchemaObject,
  ConversationHistoryResponseSchemaObject,
} from './ConversationsHistory.ts';

describe('Slack.schema.ConversationsHistory', () => {
  describe('ConversationHistoryRequestSchemaObject', () => {
    it('accepts the minimal required field', () => {
      const [error, request] = ConversationHistoryRequestSchemaObject
        .safeParse({ channel: 'C123ABC456' });
      asserts.assertEquals(error, null);
      asserts.assertEquals(request?.channel, 'C123ABC456');
    });

    it('accepts the documented optional fields', () => {
      asserts.assertEquals(
        ConversationHistoryRequestSchemaObject.safeParse({
          channel: 'C1',
          cursor: 'abc123',
          limit: 50,
          oldest: '1512085950.000216',
          latest: '1512085960.000216',
        })[0],
        null,
      );
    });

    it('rejects a missing channel', () => {
      asserts.assertExists(
        ConversationHistoryRequestSchemaObject.safeParse({})[0],
      );
    });

    it('rejects a limit above the documented maximum of 999', () => {
      asserts.assertExists(
        ConversationHistoryRequestSchemaObject.safeParse({
          channel: 'C1',
          limit: 1000,
        })[0],
      );
    });
  });

  describe('ConversationHistoryResponseSchemaObject', () => {
    it('accepts a documented success response', () => {
      const [error, response] = ConversationHistoryResponseSchemaObject
        .safeParse({
          ok: true,
          messages: [
            {
              type: 'message',
              user: 'U123ABC456',
              text: 'Sample message',
              ts: '1512085950.000216',
            },
          ],
          has_more: true,
          pin_count: 0,
          response_metadata: {
            next_cursor: 'bmV4dF90czoxNTEyMDg1ODYxMDAwNTQz',
          },
        });
      asserts.assertEquals(error, null);
      asserts.assertEquals(response?.messages.length, 1);
      asserts.assertEquals(response?.has_more, true);
    });

    it('rejects a response missing messages', () => {
      asserts.assertExists(
        ConversationHistoryResponseSchemaObject.safeParse({ ok: true })[0],
      );
    });
  });
});
