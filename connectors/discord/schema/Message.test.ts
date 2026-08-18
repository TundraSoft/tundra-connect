import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  AttachmentSchemaObject,
  DiscordUserSchemaObject,
  MessageSchemaObject,
} from './Message.ts';

const validAuthor = {
  id: '345678901234567890',
  username: 'webhook-bot',
  discriminator: '0000',
  avatar: null,
};

const validMessage = {
  id: '123456789012345678',
  channel_id: '234567890123456789',
  author: validAuthor,
  content: 'Deploy succeeded',
  timestamp: '2024-01-01T12:00:00.000000+00:00',
  edited_timestamp: null,
  tts: false,
  mention_everyone: false,
  mentions: [],
  mention_roles: [],
  attachments: [],
  embeds: [],
  pinned: false,
  type: 0,
};

describe('Discord.schema.Message', () => {
  it('accepts a minimal documented message response', () => {
    asserts.assertEquals(MessageSchemaObject.safeParse(validMessage)[0], null);
  });

  it('accepts a message with embeds and webhook metadata', () => {
    const [err] = MessageSchemaObject.safeParse({
      ...validMessage,
      webhook_id: '456789012345678901',
      flags: 0,
      embeds: [{ title: 'Deploy', description: 'Build #482 shipped.' }],
    });
    asserts.assertEquals(err, null);
  });

  it('accepts an undocumented extra field via passthrough', () => {
    const [err, parsed] = MessageSchemaObject.safeParse({
      ...validMessage,
      poll: { question: { text: 'Ship it?' } },
    });
    asserts.assertEquals(err, null);
    asserts.assertEquals(
      (parsed as unknown as { poll?: unknown }).poll !== undefined,
      true,
    );
  });

  it('rejects a missing required field', () => {
    const { id: _id, ...withoutId } = validMessage;
    asserts.assertExists(MessageSchemaObject.safeParse(withoutId)[0]);
  });

  it('rejects an invalid channel_id', () => {
    asserts.assertExists(
      MessageSchemaObject.safeParse({ ...validMessage, channel_id: 'abc' })[0],
    );
  });

  it('rejects a non-array mentions field', () => {
    asserts.assertExists(
      MessageSchemaObject.safeParse({ ...validMessage, mentions: {} })[0],
    );
  });
});

describe('Discord.schema.Message.DiscordUserSchemaObject', () => {
  it('accepts a minimal user', () => {
    asserts.assertEquals(
      DiscordUserSchemaObject.safeParse(validAuthor)[0],
      null,
    );
  });

  it('accepts a bot user with public_flags', () => {
    asserts.assertEquals(
      DiscordUserSchemaObject.safeParse({
        ...validAuthor,
        bot: true,
        public_flags: 65536,
      })[0],
      null,
    );
  });

  it('rejects a user missing username', () => {
    const { username: _u, ...withoutUsername } = validAuthor;
    asserts.assertExists(DiscordUserSchemaObject.safeParse(withoutUsername)[0]);
  });
});

describe('Discord.schema.Message.AttachmentSchemaObject', () => {
  const validAttachment = {
    id: '567890123456789012',
    filename: 'graph.png',
    size: 2048,
    url: 'https://cdn.discordapp.com/attachments/1/2/graph.png',
    proxy_url: 'https://media.discordapp.net/attachments/1/2/graph.png',
  };

  it('accepts a minimal attachment', () => {
    asserts.assertEquals(
      AttachmentSchemaObject.safeParse(validAttachment)[0],
      null,
    );
  });

  it('accepts an image attachment with dimensions', () => {
    asserts.assertEquals(
      AttachmentSchemaObject.safeParse({
        ...validAttachment,
        content_type: 'image/png',
        height: 100,
        width: 200,
      })[0],
      null,
    );
  });

  it('rejects an attachment missing a size', () => {
    const { size: _s, ...withoutSize } = validAttachment;
    asserts.assertExists(AttachmentSchemaObject.safeParse(withoutSize)[0]);
  });
});
