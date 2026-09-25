import * as asserts from '@asserts';
import { describe, it } from '@test';
import { WebhookMessageRequestSchemaObject } from './WebhookMessageRequest.ts';

describe('Discord.schema.WebhookMessageRequest', () => {
  it('accepts a request with content only', () => {
    asserts.assertEquals(
      WebhookMessageRequestSchemaObject.safeParse({ content: 'Hello!' })[0],
      null,
    );
  });

  it('accepts a request with embeds only', () => {
    asserts.assertEquals(
      WebhookMessageRequestSchemaObject.safeParse({
        embeds: [{ description: 'Hello!' }],
      })[0],
      null,
    );
  });

  it('accepts username/avatar_url overrides', () => {
    asserts.assertEquals(
      WebhookMessageRequestSchemaObject.safeParse({
        content: 'Hello!',
        username: 'Deploy Bot',
        avatar_url: 'https://example.com/bot.png',
      })[0],
      null,
    );
  });

  it('accepts tts and allowed_mentions', () => {
    asserts.assertEquals(
      WebhookMessageRequestSchemaObject.safeParse({
        content: 'Hello!',
        tts: true,
        allowed_mentions: { parse: [] },
      })[0],
      null,
    );
  });

  it('accepts a thread_name for forum-channel webhooks', () => {
    asserts.assertEquals(
      WebhookMessageRequestSchemaObject.safeParse({
        content: 'Hello!',
        thread_name: 'Deploy notifications',
      })[0],
      null,
    );
  });

  it('rejects a request with neither content nor embeds', () => {
    asserts.assertExists(
      WebhookMessageRequestSchemaObject.safeParse({ username: 'Bot' })[0],
    );
  });

  it('rejects a request with empty content and no embeds', () => {
    asserts.assertExists(
      WebhookMessageRequestSchemaObject.safeParse({ content: '' })[0],
    );
  });

  it('rejects content over 2000 characters', () => {
    asserts.assertExists(
      WebhookMessageRequestSchemaObject.safeParse({
        content: 'x'.repeat(2001),
      })[0],
    );
  });

  it('rejects more than 10 embeds', () => {
    const embeds = Array.from({ length: 11 }, (_, i) => ({
      description: `Embed ${i}`,
    }));
    asserts.assertExists(
      WebhookMessageRequestSchemaObject.safeParse({ embeds })[0],
    );
  });

  it('rejects embeds that exceed the combined 6000-character budget', () => {
    const embeds = [
      { description: 'x'.repeat(4000) },
      { description: 'y'.repeat(4000) },
    ];
    asserts.assertExists(
      WebhookMessageRequestSchemaObject.safeParse({ embeds })[0],
    );
  });
});
