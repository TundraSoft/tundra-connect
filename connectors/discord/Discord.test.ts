import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { Discord } from './Discord.ts';
import { DiscordError } from './errors/mod.ts';

const WEBHOOK_ID = '123456789012345678';
const WEBHOOK_TOKEN = 'some-webhook-token';
const WEBHOOK_URL =
  `https://discord.com/api/webhooks/${WEBHOOK_ID}/${WEBHOOK_TOKEN}`;
const CHANNEL_ID = '234567890123456789';
const BOT_TOKEN = 'a-bot-token';

const validMessageResponse = {
  id: '345678901234567890',
  channel_id: CHANNEL_ID,
  author: {
    id: '456789012345678901',
    username: 'notifier',
    discriminator: '0000',
    avatar: null,
    bot: true,
  },
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

class MockDiscord extends Discord {
  public request?: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
  private responseBody: unknown = validMessageResponse;
  private responseStatus = 200;

  setResponse(body: unknown, status = 200): void {
    this.responseBody = body;
    this.responseStatus = status;
    this._fetch = async (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: init?.body as string,
      };
      if (this.responseStatus === 204) {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify(this.responseBody), {
        status: this.responseStatus,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }
}

describe('Discord', () => {
  describe('constructor', () => {
    it('accepts webhook mode configured via webhookUrl', () => {
      const client = new MockDiscord({ webhookUrl: WEBHOOK_URL });
      asserts.assertEquals(client.vendor, 'Discord');
      asserts.assertEquals(client.mode, 'webhook');
    });

    it('accepts webhook mode configured via webhookId + webhookToken', () => {
      const client = new MockDiscord({
        webhookId: WEBHOOK_ID,
        webhookToken: WEBHOOK_TOKEN,
      });
      asserts.assertEquals(client.mode, 'webhook');
    });

    it('accepts bot mode configured via botToken', () => {
      const client = new MockDiscord({ botToken: BOT_TOKEN });
      asserts.assertEquals(client.mode, 'bot');
    });

    it('rejects a client with no credentials', () => {
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new MockDiscord({} as any),
        DiscordError,
        'either a webhook',
      );
    });

    it('rejects a client with both a webhook and a bot token', () => {
      asserts.assertThrows(
        () =>
          new MockDiscord(
            // deno-lint-ignore no-explicit-any
            { webhookUrl: WEBHOOK_URL, botToken: BOT_TOKEN } as any,
          ),
        DiscordError,
        'exactly one',
      );
    });

    it('rejects a client with both webhookUrl and webhookId + webhookToken', () => {
      asserts.assertThrows(
        () =>
          new MockDiscord(
            // deno-lint-ignore no-explicit-any
            {
              webhookUrl: WEBHOOK_URL,
              webhookId: WEBHOOK_ID,
              webhookToken: WEBHOOK_TOKEN,
            } as any,
          ),
        DiscordError,
        'exactly one',
      );
    });

    it('rejects a webhookId without a matching webhookToken', () => {
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new MockDiscord({ webhookId: WEBHOOK_ID } as any),
        DiscordError,
        'supplied together',
      );
    });

    it('rejects a malformed webhookUrl', () => {
      asserts.assertThrows(
        () =>
          new MockDiscord({ webhookUrl: 'https://example.com/not-a-webhook' }),
        DiscordError,
        'must match',
      );
    });

    it('rejects a webhookId containing a slash at construction', () => {
      asserts.assertThrows(
        () =>
          new MockDiscord({
            webhookId: '1234567890123456/78',
            webhookToken: WEBHOOK_TOKEN,
          }),
        DiscordError,
        'snowflake',
      );
    });

    it("rejects a webhookToken of '..' at construction", () => {
      asserts.assertThrows(
        () =>
          new MockDiscord({
            webhookId: WEBHOOK_ID,
            webhookToken: '..',
          }),
        DiscordError,
        'single URL path segment',
      );
    });

    it("rejects a webhookToken containing '?' at construction", () => {
      asserts.assertThrows(
        () =>
          new MockDiscord({
            webhookId: WEBHOOK_ID,
            webhookToken: 'token?wait=true',
          }),
        DiscordError,
        'single URL path segment',
      );
    });

    it("rejects a webhookToken containing '/' without leaking its value", () => {
      try {
        new MockDiscord({
          webhookId: WEBHOOK_ID,
          webhookToken: 'super-secret/../../channels',
        });
        throw new Error('expected constructor to throw');
      } catch (e) {
        const error = e as DiscordError;
        asserts.assertEquals(error instanceof DiscordError, true);
        // Neither the rendered message nor the serialized error (which
        // carries `.context`) may contain the credential-bearing token.
        asserts.assertEquals(error.message.includes('super-secret'), false);
        const serialized = JSON.stringify(error.toJSON());
        asserts.assertEquals(serialized.includes('super-secret'), false);
      }
    });

    it('rejects a blank botToken', () => {
      asserts.assertThrows(
        () => new MockDiscord({ botToken: '   ' }),
        DiscordError,
        'non-empty string',
      );
    });

    it('never leaks the raw webhookUrl into a malformed-webhookUrl error', () => {
      const secretUrl =
        'https://discord.com/api/webhooks/123456789012345678/super-secret-token';
      try {
        new MockDiscord({ webhookUrl: `${secretUrl}/trailing-junk` });
        throw new Error('expected constructor to throw');
      } catch (e) {
        const error = e as DiscordError;
        asserts.assertEquals(error instanceof DiscordError, true);
        // Neither the rendered message nor the serialized error (which
        // carries `.context`) may contain the credential-bearing URL/token.
        asserts.assertEquals(
          error.message.includes('super-secret-token'),
          false,
        );
        const serialized = JSON.stringify(error.toJSON());
        asserts.assertEquals(serialized.includes('super-secret-token'), false);
      }
    });

    it('accepts bot mode when sibling webhook fields are explicitly undefined', () => {
      const client = new MockDiscord(
        {
          botToken: BOT_TOKEN,
          webhookUrl: undefined,
          webhookId: undefined,
          webhookToken: undefined,
          // deno-lint-ignore no-explicit-any
        } as any,
      );
      asserts.assertEquals(client.mode, 'bot');
    });

    it('accepts webhook mode (via webhookUrl) when botToken is explicitly undefined', () => {
      const client = new MockDiscord(
        {
          webhookUrl: WEBHOOK_URL,
          botToken: undefined,
          // deno-lint-ignore no-explicit-any
        } as any,
      );
      asserts.assertEquals(client.mode, 'webhook');
    });

    it('accepts webhook mode (via webhookId + webhookToken) when botToken is explicitly undefined', () => {
      const client = new MockDiscord(
        {
          webhookId: WEBHOOK_ID,
          webhookToken: WEBHOOK_TOKEN,
          botToken: undefined,
          // deno-lint-ignore no-explicit-any
        } as any,
      );
      asserts.assertEquals(client.mode, 'webhook');
    });
  });

  describe('sendWebhookMessage', () => {
    it('posts to /webhooks/{id}/{token} with no Authorization header', async () => {
      const client = new MockDiscord({ webhookUrl: WEBHOOK_URL });
      client.setResponse(null, 204);

      const result = await client.sendWebhookMessage({
        content: 'Deploy succeeded',
      });

      asserts.assertEquals(result, undefined);
      asserts.assertEquals(client.request?.method, 'POST');
      asserts.assertStringIncludes(
        client.request?.url ?? '',
        `/webhooks/${WEBHOOK_ID}/${WEBHOOK_TOKEN}`,
      );
      asserts.assertEquals(
        client.request?.headers?.['Authorization'],
        undefined,
      );
    });

    it('builds the same path from webhookId + webhookToken', async () => {
      const client = new MockDiscord({
        webhookId: WEBHOOK_ID,
        webhookToken: WEBHOOK_TOKEN,
      });
      client.setResponse(null, 204);

      await client.sendWebhookMessage({ content: 'hi' });

      // Exact-match the request URL: a valid id + token pair must pass
      // through byte-for-byte (the defensive encoding is a no-op for every
      // value the constructor accepts).
      const url = new URL(client.request?.url ?? '');
      asserts.assertEquals(
        `${url.origin}${url.pathname}`,
        `https://discord.com/api/v10/webhooks/${WEBHOOK_ID}/${WEBHOOK_TOKEN}`,
      );
    });

    it('does not set ?wait and returns undefined by default', async () => {
      const client = new MockDiscord({ webhookUrl: WEBHOOK_URL });
      client.setResponse(null, 204);

      const result = await client.sendWebhookMessage({ content: 'hi' });

      asserts.assertEquals(result, undefined);
      const url = new URL(client.request?.url ?? '');
      asserts.assertEquals(url.searchParams.has('wait'), false);
    });

    it('sets ?wait=true and returns the created message when requested', async () => {
      const client = new MockDiscord({ webhookUrl: WEBHOOK_URL });
      client.setResponse(validMessageResponse, 200);

      const result = await client.sendWebhookMessage(
        { content: 'Deploy succeeded' },
        { wait: true },
      );

      asserts.assertEquals(result?.id, validMessageResponse.id);
      const url = new URL(client.request?.url ?? '');
      asserts.assertEquals(url.searchParams.get('wait'), 'true');
    });

    it('sets ?thread_id when threadId is supplied', async () => {
      const client = new MockDiscord({ webhookUrl: WEBHOOK_URL });
      client.setResponse(null, 204);
      const threadId = '987654321098765432';

      await client.sendWebhookMessage({ content: 'hi' }, { threadId });

      const url = new URL(client.request?.url ?? '');
      asserts.assertEquals(url.searchParams.get('thread_id'), threadId);
    });

    it('rejects an invalid threadId before calling the API', async () => {
      const client = new MockDiscord({ webhookUrl: WEBHOOK_URL });
      client.setResponse(null, 204);

      await asserts.assertRejects(
        () =>
          client.sendWebhookMessage({ content: 'hi' }, { threadId: 'nope' }),
        DiscordError,
        'snowflake',
      );
      asserts.assertEquals(client.request, undefined);
    });

    it('rejects a message with neither content nor embeds before calling the API', async () => {
      const client = new MockDiscord({ webhookUrl: WEBHOOK_URL });
      client.setResponse(null, 204);

      await asserts.assertRejects(
        // deno-lint-ignore no-explicit-any
        () => client.sendWebhookMessage({ username: 'Bot' } as any),
        DiscordError,
      );
      asserts.assertEquals(client.request, undefined);
    });

    it('rejects sendWebhookMessage when configured for bot mode', async () => {
      const client = new MockDiscord({ botToken: BOT_TOKEN });
      client.setResponse(null, 204);

      await asserts.assertRejects(
        () => client.sendWebhookMessage({ content: 'hi' }),
        DiscordError,
        'webhook',
      );
      asserts.assertEquals(client.request, undefined);
    });
  });

  describe('sendChannelMessage', () => {
    it('posts to /channels/{id}/messages with Authorization: Bot {token}', async () => {
      const client = new MockDiscord({ botToken: BOT_TOKEN });
      client.setResponse(validMessageResponse, 200);

      const message = await client.sendChannelMessage(CHANNEL_ID, {
        content: 'Deploy succeeded',
      });

      asserts.assertEquals(message.id, validMessageResponse.id);
      asserts.assertEquals(client.request?.method, 'POST');
      asserts.assertStringIncludes(
        client.request?.url ?? '',
        `/channels/${CHANNEL_ID}/messages`,
      );
      asserts.assertEquals(
        client.request?.headers?.['Authorization'],
        `Bot ${BOT_TOKEN}`,
      );
    });

    it('rejects an invalid channelId before calling the API', async () => {
      const client = new MockDiscord({ botToken: BOT_TOKEN });
      client.setResponse(validMessageResponse, 200);

      await asserts.assertRejects(
        () => client.sendChannelMessage('not-a-channel', { content: 'hi' }),
        DiscordError,
        'snowflake',
      );
      asserts.assertEquals(client.request, undefined);
    });

    it('rejects a message with neither content nor embeds before calling the API', async () => {
      const client = new MockDiscord({ botToken: BOT_TOKEN });
      client.setResponse(validMessageResponse, 200);

      await asserts.assertRejects(
        // deno-lint-ignore no-explicit-any
        () => client.sendChannelMessage(CHANNEL_ID, { tts: true } as any),
        DiscordError,
      );
      asserts.assertEquals(client.request, undefined);
    });

    it('rejects sendChannelMessage when configured for webhook mode', async () => {
      const client = new MockDiscord({ webhookUrl: WEBHOOK_URL });
      client.setResponse(validMessageResponse, 200);

      await asserts.assertRejects(
        () => client.sendChannelMessage(CHANNEL_ID, { content: 'hi' }),
        DiscordError,
        'bot',
      );
      asserts.assertEquals(client.request, undefined);
    });

    it('rejects a malformed 2xx success response', async () => {
      const client = new MockDiscord({ botToken: BOT_TOKEN });
      client.setResponse({ id: 'not-enough-fields' }, 200);

      await asserts.assertRejects(
        () => client.sendChannelMessage(CHANNEL_ID, { content: 'hi' }),
        DiscordError,
        'validation',
      );
    });
  });

  describe('vendor error mapping', () => {
    it('maps every documented vendor error code reachable from sending a message', async () => {
      const cases: Array<{ code: number; expected: string }> = [
        { code: 0, expected: 'General error' },
        { code: 10003, expected: 'Unknown channel' },
        { code: 10008, expected: 'Unknown message' },
        { code: 10015, expected: 'Unknown webhook' },
        { code: 30015, expected: 'Maximum number of attachments' },
        { code: 50001, expected: 'Missing access' },
        { code: 50006, expected: 'Cannot send an empty message' },
        { code: 50007, expected: 'Cannot send messages to this user' },
        { code: 50008, expected: 'non-text channel' },
        { code: 50013, expected: 'lacks permission' },
        { code: 50014, expected: 'Invalid authentication token' },
        { code: 50027, expected: 'Invalid webhook token' },
        { code: 50035, expected: 'Invalid form body' },
        { code: 50045, expected: 'exceeds the maximum size' },
      ];

      for (const { code, expected } of cases) {
        const client = new MockDiscord({ botToken: BOT_TOKEN });
        client.setResponse({ code, message: 'vendor message' }, 400);
        await asserts.assertRejects(
          () => client.sendChannelMessage(CHANNEL_ID, { content: 'hi' }),
          DiscordError,
          expected,
        );
      }
    });

    it('falls back to the status-based code for an undocumented vendor error code', async () => {
      const client = new MockDiscord({ botToken: BOT_TOKEN });
      client.setResponse({ code: 999999, message: 'mystery error' }, 400);

      await asserts.assertRejects(
        () => client.sendChannelMessage(CHANNEL_ID, { content: 'hi' }),
        DiscordError,
        'unknown error',
      );
    });

    it('maps a 401 without a parseable body to UNAUTHORIZED', async () => {
      const client = new MockDiscord({ botToken: BOT_TOKEN });
      client.setResponse({ oops: true }, 401);

      await asserts.assertRejects(
        () => client.sendChannelMessage(CHANNEL_ID, { content: 'hi' }),
        DiscordError,
        'unauthenticated',
      );
    });

    it('maps a 403 without a parseable body to FORBIDDEN', async () => {
      const client = new MockDiscord({ botToken: BOT_TOKEN });
      client.setResponse({ oops: true }, 403);

      await asserts.assertRejects(
        () => client.sendChannelMessage(CHANNEL_ID, { content: 'hi' }),
        DiscordError,
        'not permitted',
      );
    });

    it('maps a 404 without a parseable body to NOT_FOUND', async () => {
      const client = new MockDiscord({ botToken: BOT_TOKEN });
      client.setResponse({ oops: true }, 404);

      await asserts.assertRejects(
        () => client.sendChannelMessage(CHANNEL_ID, { content: 'hi' }),
        DiscordError,
        'not found',
      );
    });

    it('maps a 429 to RATE_LIMITED with retryAfter metadata', async () => {
      const client = new MockDiscord({ botToken: BOT_TOKEN });
      client.setResponse(
        {
          message: 'You are being rate limited.',
          retry_after: 1.5,
          global: false,
        },
        429,
      );

      const error = await asserts.assertRejects(
        () => client.sendChannelMessage(CHANNEL_ID, { content: 'hi' }),
        DiscordError,
        'retry after',
      );
      asserts.assertEquals(error.getContextValue('retryAfter'), 1.5);
    });

    it('maps a 429 whose body does not match RateLimitSchemaObject to a message with no unpopulated placeholder', async () => {
      const client = new MockDiscord({ botToken: BOT_TOKEN });
      // Missing `retry_after`/`global` — fails `RateLimitSchemaObject`,
      // mirroring a malformed/truncated proxy body.
      client.setResponse({ message: 'You are being rate limited.' }, 429);

      const error = await asserts.assertRejects(
        () => client.sendChannelMessage(CHANNEL_ID, { content: 'hi' }),
        DiscordError,
        'retry after',
      );
      asserts.assertNotMatch(error.message, /\$\{/);
    });

    it('treats a 5xx response as SERVICE_UNAVAILABLE', async () => {
      const client = new MockDiscord({ botToken: BOT_TOKEN });
      client.setResponse({ message: 'internal error' }, 500);

      await asserts.assertRejects(
        () => client.sendChannelMessage(CHANNEL_ID, { content: 'hi' }),
        DiscordError,
        'currently unavailable',
      );
    });

    it('treats an unparseable 4xx body as its status-mapped code', async () => {
      const client = new MockDiscord({ botToken: BOT_TOKEN });
      client.setResponse('not an error envelope', 400);

      await asserts.assertRejects(
        () => client.sendChannelMessage(CHANNEL_ID, { content: 'hi' }),
        DiscordError,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Live test — exercises the real Discord bot API. Skipped entirely unless
// CONNECTOR_DISCORD_BOT_TOKEN/CONNECTOR_DISCORD_CHANNEL_ID are both set (via
// env or a `.env` file — see `envArgs`) AND LIVE_TEST_ALLOW_VISIBLE_EFFECTS
// is set. There is no read method or delete-message method on this
// connect to verify against or clean up after, so this posts a real,
// obviously-synthetic message a human could see in the channel.
// ---------------------------------------------------------------------------

function hexOf(bytes: Uint8Array): string {
  let o = '';
  for (const b of bytes) o += b.toString(16).padStart(2, '0');
  return o;
}
async function ed25519() {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ]) as CryptoKeyPair;
  const publicKey = hexOf(
    new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)),
  );
  const sign = async (msg: string) =>
    hexOf(
      new Uint8Array(
        await crypto.subtle.sign(
          { name: 'Ed25519' },
          kp.privateKey,
          new TextEncoder().encode(msg) as unknown as BufferSource,
        ),
      ),
    );
  return { publicKey, sign };
}
describe('Discord — verifyWebhook (interactions, Ed25519)', () => {
  const NOW_MS = 1_700_000_000_000;
  const TS = String(Math.floor(NOW_MS / 1000));
  const PAYLOAD = JSON.stringify({ type: 2, data: { name: 'deploy' } });
  const client = () => new MockDiscord({ botToken: BOT_TOKEN });
  const hdrs = (sig: string, ts = TS) => ({
    'x-signature-ed25519': sig,
    'x-signature-timestamp': ts,
  });

  it('accepts a genuine signature over timestamp+payload and returns the parsed interaction', async () => {
    const k = await ed25519();
    const i = await client().verifyWebhook({
      payload: PAYLOAD,
      headers: hdrs(await k.sign(TS + PAYLOAD)),
      publicKey: k.publicKey,
      nowMs: NOW_MS,
    }) as { type: number };
    asserts.assertEquals(i.type, 2);
  });
  it('rejects a tampered payload and a signature from another application', async () => {
    const k = await ed25519();
    const other = await ed25519();
    const e1 = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD + ' ',
          headers: hdrs(await k.sign(TS + PAYLOAD)),
          publicKey: k.publicKey,
          nowMs: NOW_MS,
        }),
      DiscordError,
    );
    asserts.assertEquals(e1.code, 'WEBHOOK_SIGNATURE_INVALID');
    const e2 = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD,
          headers: hdrs(await other.sign(TS + PAYLOAD)),
          publicKey: k.publicKey,
          nowMs: NOW_MS,
        }),
      DiscordError,
    );
    asserts.assertEquals(e2.code, 'WEBHOOK_SIGNATURE_INVALID');
  });
  it('rejects a replay outside the window, a malformed key, and missing headers', async () => {
    const k = await ed25519();
    const e1 = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD,
          headers: hdrs(await k.sign(TS + PAYLOAD)),
          publicKey: k.publicKey,
          nowMs: NOW_MS + 301_000,
        }),
      DiscordError,
    );
    asserts.assertEquals(e1.code, 'WEBHOOK_TIMESTAMP_INVALID');
    const e2 = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD,
          headers: hdrs(await k.sign(TS + PAYLOAD)),
          publicKey: 'not-hex',
          nowMs: NOW_MS,
        }),
      DiscordError,
    );
    asserts.assertEquals(e2.code, 'WEBHOOK_INVALID_KEY');
    const e3 = await asserts.assertRejects(
      () =>
        client().verifyWebhook({
          payload: PAYLOAD,
          headers: {},
          publicKey: k.publicKey,
          nowMs: NOW_MS,
        }),
      DiscordError,
    );
    asserts.assertEquals(e3.code, 'WEBHOOK_INVALID_HEADERS');
  });
  it('rejects a non-numeric timestamp as WEBHOOK_TIMESTAMP_INVALID', async () => {
    const k = await ed25519();
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD,
          headers: hdrs('ab'.repeat(64), 'not-a-number'),
          publicKey: k.publicKey,
          nowMs: NOW_MS,
        }),
      DiscordError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_TIMESTAMP_INVALID');
  });
  it('rejects a signature that is not 64 hex bytes as WEBHOOK_SIGNATURE_INVALID', async () => {
    const k = await ed25519();
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD,
          headers: hdrs('zz'),
          publicKey: k.publicKey,
          nowMs: NOW_MS,
        }),
      DiscordError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });
});

const env = envArgs();
const credentials = {
  botToken: env.get('CONNECTOR_DISCORD_BOT_TOKEN'),
  channelId: env.get('CONNECTOR_DISCORD_CHANNEL_ID'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);
const visibleEffectsAllowed = !!env.get('LIVE_TEST_ALLOW_VISIBLE_EFFECTS');

// Sends a real, visible message — gated behind LIVE_TEST_ALLOW_VISIBLE_EFFECTS
// so it never fires on the unattended monthly schedule.
describe('Discord — maxRetryWait (RESTler rate-limit retry)', () => {
  /**
   * A client whose every request is answered 429 with a `retry-after` hint,
   * and whose waits are recorded instead of slept. `maxRetryWait` is what
   * routes a 429 to RESTler's retry logic (and so to this connect's
   * `RESTlerRateLimitError` rewrap) — without it the vendor handler maps the
   * 429 directly, which the error-mapping tests already cover.
   */
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockDiscord({ botToken: BOT_TOKEN, maxRetryWait });
    const slept: number[] = [];
    let calls = 0;
    c['_sleep'] = (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    };
    c['_fetch'] = (input) => {
      calls++;
      return Promise.resolve(
        new Response('{}', {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': retryAfter,
          },
        }),
      );
    };
    return { c, slept, calls: () => calls };
  };

  it('waits the hinted time, retries once, then surfaces RATE_LIMITED with retried: true', async () => {
    const { c, slept, calls } = throttled(60, '1');
    const err = await asserts.assertRejects(
      () => c.sendChannelMessage(CHANNEL_ID, { content: 'hi' }),
      DiscordError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 1);
    asserts.assertEquals(slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws RATE_LIMITED immediately with retried: false when the hint exceeds maxRetryWait', async () => {
    const { c, slept, calls } = throttled(5, '120');
    const err = await asserts.assertRejects(
      () => c.sendChannelMessage(CHANNEL_ID, { content: 'hi' }),
      DiscordError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
  it('rewraps the rate-limit error in webhook mode too (sendWebhookMessage calls _makeRequest directly)', async () => {
    const c = new MockDiscord({ webhookUrl: WEBHOOK_URL, maxRetryWait: 5 });
    c['_fetch'] = () =>
      Promise.resolve(
        new Response('{}', {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': '120',
          },
        }),
      );
    const err = await asserts.assertRejects(
      () => c.sendWebhookMessage({ content: 'hi' }),
      DiscordError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
  });
});

describe('Discord — webhook config validation', () => {
  it('rejects a blank webhookId as CONFIG_INCOMPLETE_WEBHOOK', () => {
    const err = asserts.assertThrows(
      () => new MockDiscord({ webhookId: '   ', webhookToken: 'token' }),
      DiscordError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INCOMPLETE_WEBHOOK');
  });
  it('rejects a blank webhookToken as CONFIG_INCOMPLETE_WEBHOOK', () => {
    const err = asserts.assertThrows(
      () =>
        new MockDiscord({
          webhookId: '123456789012345678',
          webhookToken: '   ',
        }),
      DiscordError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INCOMPLETE_WEBHOOK');
  });
});

describe({
  name: 'Discord — live',
  ignore: !liveTestsEnabled || !visibleEffectsAllowed,
  bun: false,
  node: false,
  fn: () => {
    it('sends a real channel message via the bot API', async () => {
      const client = new Discord({ botToken: credentials.botToken! });

      const message = await client.sendChannelMessage(
        credentials.channelId!,
        { content: `[tundra-connect live test — ${new Date().toISOString()}]` },
      );

      asserts.assertExists(message.id);
    });
  },
});
