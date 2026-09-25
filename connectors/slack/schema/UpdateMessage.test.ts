import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  UpdateMessageRequestSchemaObject,
  UpdateMessageResponseSchemaObject,
} from './UpdateMessage.ts';

describe('Slack.schema.UpdateMessage', () => {
  describe('UpdateMessageRequestSchemaObject', () => {
    it('accepts the required fields', () => {
      const [error, request] = UpdateMessageRequestSchemaObject.safeParse({
        channel: 'C123ABC456',
        ts: '1401383885.000061',
        text: 'Updated text you carefully authored',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(
        request?.text,
        'Updated text you carefully authored',
      );
    });

    it('rejects a missing ts', () => {
      asserts.assertExists(
        UpdateMessageRequestSchemaObject.safeParse({
          channel: 'C1',
          text: 'hi',
        })[0],
      );
    });

    it('rejects a missing text', () => {
      asserts.assertExists(
        UpdateMessageRequestSchemaObject.safeParse({
          channel: 'C1',
          ts: '1401383885.000061',
        })[0],
      );
    });
  });

  describe('UpdateMessageResponseSchemaObject', () => {
    it("accepts Slack's documented reduced message echo", () => {
      const [error, response] = UpdateMessageResponseSchemaObject.safeParse({
        ok: true,
        channel: 'C123ABC456',
        ts: '1401383885.000061',
        text: 'Updated text you carefully authored',
        message: {
          text: 'Updated text you carefully authored',
          user: 'U34567890',
        },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(response?.message?.user, 'U34567890');
    });

    it('accepts a response with message omitted', () => {
      asserts.assertEquals(
        UpdateMessageResponseSchemaObject.safeParse({
          ok: true,
          channel: 'C1',
          ts: '1401383885.000061',
          text: 'hi',
        })[0],
        null,
      );
    });
  });
});
