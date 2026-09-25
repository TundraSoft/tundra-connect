import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  AllowedMentionsSchemaObject,
  parseWebhookUrl,
  snowflakeGuard,
  webhookTokenGuard,
  webhookUrlGuard,
} from './Common.ts';

describe('Discord.schema.Common', () => {
  it('accepts a valid snowflake ID', () => {
    asserts.assertEquals(
      snowflakeGuard.safeParse('123456789012345678')[0],
      null,
    );
  });

  it('rejects a snowflake that is too short', () => {
    asserts.assertExists(snowflakeGuard.safeParse('12345')[0]);
  });

  it('rejects a non-numeric snowflake', () => {
    asserts.assertExists(snowflakeGuard.safeParse('12345abc901234567')[0]);
  });

  it('accepts a URL-safe standalone webhook token', () => {
    asserts.assertEquals(
      webhookTokenGuard.safeParse('abcDEF_1234-xyz')[0],
      null,
    );
  });

  it("rejects a standalone webhook token containing '/', '?', or '#'", () => {
    asserts.assertExists(webhookTokenGuard.safeParse('a/b')[0]);
    asserts.assertExists(webhookTokenGuard.safeParse('a?wait=true')[0]);
    asserts.assertExists(webhookTokenGuard.safeParse('a#frag')[0]);
  });

  it("rejects the relative path segments '.' and '..' as a webhook token", () => {
    asserts.assertExists(webhookTokenGuard.safeParse('.')[0]);
    asserts.assertExists(webhookTokenGuard.safeParse('..')[0]);
  });

  it('rejects an empty standalone webhook token', () => {
    asserts.assertExists(webhookTokenGuard.safeParse('')[0]);
  });

  it('accepts a valid webhook URL', () => {
    asserts.assertEquals(
      webhookUrlGuard.safeParse(
        'https://discord.com/api/webhooks/123456789012345678/some-token',
      )[0],
      null,
    );
  });

  it('accepts a versioned webhook URL', () => {
    asserts.assertEquals(
      webhookUrlGuard.safeParse(
        'https://discord.com/api/v10/webhooks/123456789012345678/some-token',
      )[0],
      null,
    );
  });

  it('rejects a webhook URL on the wrong host', () => {
    asserts.assertExists(
      webhookUrlGuard.safeParse(
        'https://evil.example.com/api/webhooks/123456789012345678/some-token',
      )[0],
    );
  });

  it('rejects a webhook URL missing the token segment', () => {
    asserts.assertExists(
      webhookUrlGuard.safeParse(
        'https://discord.com/api/webhooks/123456789012345678',
      )[0],
    );
  });

  it('parses id/token out of a valid webhook URL', () => {
    const parsed = parseWebhookUrl(
      'https://discord.com/api/webhooks/123456789012345678/some-token',
    );
    asserts.assertEquals(parsed?.id, '123456789012345678');
    asserts.assertEquals(parsed?.token, 'some-token');
  });

  it('returns undefined parsing an invalid webhook URL', () => {
    asserts.assertEquals(parseWebhookUrl('https://example.com'), undefined);
  });

  it('accepts a fully-populated allowed_mentions object', () => {
    asserts.assertEquals(
      AllowedMentionsSchemaObject.safeParse({
        parse: ['users'],
        roles: ['123456789012345678'],
        users: ['876543210987654321'],
        replied_user: true,
      })[0],
      null,
    );
  });

  it('accepts an empty allowed_mentions object', () => {
    asserts.assertEquals(AllowedMentionsSchemaObject.safeParse({})[0], null);
  });

  it('rejects an unsupported parse value', () => {
    asserts.assertExists(
      AllowedMentionsSchemaObject.safeParse({ parse: ['bogus'] })[0],
    );
  });
});
