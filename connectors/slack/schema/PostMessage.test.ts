import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  PostMessageRequestSchemaObject,
  PostMessageResponseSchemaObject,
} from './PostMessage.ts';

describe('Slack.schema.PostMessage', () => {
  describe('PostMessageRequestSchemaObject', () => {
    it('accepts the minimal required fields', () => {
      const [error, request] = PostMessageRequestSchemaObject.safeParse({
        channel: 'C123ABC456',
        text: 'Deploy succeeded',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(request?.channel, 'C123ABC456');
    });

    it('accepts a full set of documented optional fields', () => {
      const [error, request] = PostMessageRequestSchemaObject.safeParse({
        channel: 'C123ABC456',
        text: 'Deploy succeeded',
        thread_ts: '1503435956.000247',
        unfurl_links: false,
        unfurl_media: false,
        reply_broadcast: true,
        mrkdwn: true,
        parse: 'full',
        username: 'deploy-bot',
        icon_emoji: ':rocket:',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(request?.parse, 'full');
      asserts.assertEquals(request?.username, 'deploy-bot');
    });

    it('rejects a missing channel', () => {
      asserts.assertExists(
        PostMessageRequestSchemaObject.safeParse({ text: 'hi' })[0],
      );
    });

    it('rejects a missing text', () => {
      asserts.assertExists(
        PostMessageRequestSchemaObject.safeParse({ channel: 'C1' })[0],
      );
    });

    it('rejects an empty channel', () => {
      asserts.assertExists(
        PostMessageRequestSchemaObject.safeParse({ channel: '', text: 'hi' })[
          0
        ],
      );
    });

    it('rejects an undocumented parse value', () => {
      asserts.assertExists(
        PostMessageRequestSchemaObject.safeParse({
          channel: 'C1',
          text: 'hi',
          parse: 'partial',
        })[0],
      );
    });
  });

  describe('PostMessageResponseSchemaObject', () => {
    it('accepts a documented success response', () => {
      const [error, response] = PostMessageResponseSchemaObject.safeParse({
        ok: true,
        channel: 'C123ABC456',
        ts: '1503435956.000247',
        message: {
          text: "Here's a message for you",
          username: 'ecto1',
          bot_id: 'B123ABC456',
          type: 'message',
          ts: '1503435956.000247',
        },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(response?.message.text, "Here's a message for you");
    });

    it('rejects a response missing message', () => {
      asserts.assertExists(
        PostMessageResponseSchemaObject.safeParse({
          ok: true,
          channel: 'C1',
          ts: '1503435956.000247',
        })[0],
      );
    });
  });
});
