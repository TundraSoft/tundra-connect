import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ChannelMessageRequestSchemaObject } from './ChannelMessageRequest.ts';

describe('Discord.schema.ChannelMessageRequest', () => {
  it('accepts a request with content only', () => {
    asserts.assertEquals(
      ChannelMessageRequestSchemaObject.safeParse({ content: 'Hello!' })[0],
      null,
    );
  });

  it('accepts a request with embeds only', () => {
    asserts.assertEquals(
      ChannelMessageRequestSchemaObject.safeParse({
        embeds: [{ description: 'Hello!' }],
      })[0],
      null,
    );
  });

  it('accepts a message_reference for replies', () => {
    asserts.assertEquals(
      ChannelMessageRequestSchemaObject.safeParse({
        content: 'Following up',
        message_reference: { message_id: '123456789012345678' },
      })[0],
      null,
    );
  });

  it('rejects username/avatar_url as unsupported fields', () => {
    const [error, parsed] = ChannelMessageRequestSchemaObject.safeParse({
      content: 'Hello!',
      username: 'Not allowed here',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      (parsed as unknown as { username?: unknown }).username,
      undefined,
    );
  });

  it('rejects a request with neither content nor embeds', () => {
    asserts.assertExists(
      ChannelMessageRequestSchemaObject.safeParse({ tts: true })[0],
    );
  });

  it('rejects content over 2000 characters', () => {
    asserts.assertExists(
      ChannelMessageRequestSchemaObject.safeParse({
        content: 'x'.repeat(2001),
      })[0],
    );
  });

  it('rejects more than 10 embeds', () => {
    const embeds = Array.from({ length: 11 }, (_, i) => ({
      description: `Embed ${i}`,
    }));
    asserts.assertExists(
      ChannelMessageRequestSchemaObject.safeParse({ embeds })[0],
    );
  });

  it('rejects an invalid message_reference message_id', () => {
    asserts.assertExists(
      ChannelMessageRequestSchemaObject.safeParse({
        content: 'Hello!',
        message_reference: { message_id: 'not-a-snowflake' },
      })[0],
    );
  });
});
