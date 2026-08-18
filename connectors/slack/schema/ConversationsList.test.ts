import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ListConversationsRequestSchemaObject,
  ListConversationsResponseSchemaObject,
} from './ConversationsList.ts';

describe('Slack.schema.ConversationsList', () => {
  describe('ListConversationsRequestSchemaObject', () => {
    it('accepts an empty request (all fields optional)', () => {
      asserts.assertEquals(
        ListConversationsRequestSchemaObject.safeParse({})[0],
        null,
      );
    });

    it('accepts the documented optional fields', () => {
      const [error, request] = ListConversationsRequestSchemaObject.safeParse({
        cursor: 'abc123',
        limit: 200,
        exclude_archived: true,
        types: 'public_channel,private_channel',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(request?.limit, 200);
    });

    it('rejects a limit above the documented maximum', () => {
      asserts.assertExists(
        ListConversationsRequestSchemaObject.safeParse({ limit: 5000 })[0],
      );
    });

    it('rejects a non-positive limit', () => {
      asserts.assertExists(
        ListConversationsRequestSchemaObject.safeParse({ limit: 0 })[0],
      );
    });
  });

  describe('ListConversationsResponseSchemaObject', () => {
    it('accepts a documented success response', () => {
      const [error, response] = ListConversationsResponseSchemaObject
        .safeParse({
          ok: true,
          channels: [
            { id: 'C123ABC456', name: 'general', is_channel: true },
          ],
          response_metadata: { next_cursor: '' },
        });
      asserts.assertEquals(error, null);
      asserts.assertEquals(response?.channels.length, 1);
    });

    it('rejects a response missing channels', () => {
      asserts.assertExists(
        ListConversationsResponseSchemaObject.safeParse({ ok: true })[0],
      );
    });
  });
});
