import * as asserts from '@asserts';
import { describe, it } from '@test';
import { GuardianError } from '@guardian';
import { Slack } from './Slack.ts';
import { SlackError } from './errors/mod.ts';

class MockSlack extends Slack {
  public request?: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit;
  };
  private responseBody: BodyInit | null = null;
  private responseStatus = 200;
  private responseHeaders: Record<string, string> = {
    'content-type': 'application/json',
  };

  setResponse(
    body: BodyInit | null,
    status = 200,
    headers: Record<string, string> = { 'content-type': 'application/json' },
  ): void {
    this.responseBody = body;
    this.responseStatus = status;
    this.responseHeaders = headers;
    this._fetch = (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: init?.body ?? undefined,
      };
      return Promise.resolve(
        new Response(this.responseBody, {
          status: this.responseStatus,
          headers: this.responseHeaders,
        }),
      );
    };
  }
}

describe('Slack', () => {
  it('constructs with the required auth option', () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    asserts.assertEquals(client.vendor, 'Slack');
    // The bot token is deliberately NOT readable back off the client.
    asserts.assertEquals(
      (client as unknown as Record<string, unknown>).botToken,
      undefined,
    );
  });

  it('rejects a blank bot token', () => {
    asserts.assertThrows(
      () => new MockSlack({ auth: { type: 'BEARER', token: '' } }),
      SlackError,
      'non-empty string',
    );
    asserts.assertThrows(
      () => new MockSlack({ auth: { type: 'BEARER', token: '   ' } }),
      SlackError,
      'non-empty string',
    );
  });

  it('rejects a completely missing auth option', () => {
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => new MockSlack({} as any),
      SlackError,
      'non-empty string',
    );
  });

  it('rejects an auth config that is not a Bearer token', () => {
    asserts.assertThrows(
      () =>
        // deno-lint-ignore no-explicit-any
        new MockSlack({
          auth: { type: 'BASIC', username: 'x', password: 'y' },
        } as any),
      SlackError,
      'non-empty string',
    );
  });

  it('never leaks the configured token into a thrown config error', () => {
    const secretLookingToken = 'xoxb-super-secret-value-that-must-not-leak';
    let caught: SlackError | undefined;
    try {
      // `type: 'BASIC'` is not a shape Slack supports — fails validation
      // just like a blank/missing token would — while still carrying a
      // secret-looking value in `password`, to prove it never surfaces on
      // the thrown error.
      new MockSlack({
        auth: { type: 'BASIC', username: 'x', password: secretLookingToken },
        // deno-lint-ignore no-explicit-any
      } as any);
    } catch (err) {
      caught = err as SlackError;
    }
    asserts.assertExists(caught);
    asserts.assertEquals(
      caught?.message.includes(secretLookingToken),
      false,
    );
    asserts.assertEquals(
      JSON.stringify(caught?.toJSON()).includes(secretLookingToken),
      false,
    );
  });

  it('sends the configured bot token as a Bearer credential', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(
      JSON.stringify({
        ok: true,
        channel: 'C123ABC456',
        ts: '1503435956.000247',
        message: {
          type: 'message',
          ts: '1503435956.000247',
          text: "Here's a message for you",
          bot_id: 'B123ABC456',
        },
      }),
    );

    await client.postMessage({ channel: 'C123ABC456', text: 'Hello' });

    const headers = client.request?.headers as Record<string, string>;
    asserts.assertEquals(headers['Authorization'], 'BEARER xoxb-test-token');
    asserts.assertEquals(client.request?.method, 'POST');
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      '/chat.postMessage',
    );
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'https://slack.com/api',
    );
  });

  it('posts a message', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(
      JSON.stringify({
        ok: true,
        channel: 'C123ABC456',
        ts: '1503435956.000247',
        message: {
          type: 'message',
          ts: '1503435956.000247',
          text: 'Deploy succeeded',
          bot_id: 'B123ABC456',
        },
      }),
    );

    const result = await client.postMessage({
      channel: 'C123ABC456',
      text: 'Deploy succeeded',
    });
    asserts.assertEquals(result.ok, true);
    asserts.assertEquals(result.ts, '1503435956.000247');
    asserts.assertEquals(result.message.text, 'Deploy succeeded');
  });

  it('rejects postMessage with a missing required field before making a request', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    // Stub the network so an unexpected real call would fail fast instead
    // of hanging, then confirm below that it was never actually reached.
    client.setResponse(JSON.stringify({ ok: true }));

    const error = await asserts.assertRejects(
      () =>
        client.postMessage(
          // deno-lint-ignore no-explicit-any
          { channel: 'C123ABC456' } as any,
        ),
      SlackError,
    );
    asserts.assertEquals(error.code, 'INVALID_REQUEST');
    asserts.assertInstanceOf(error.cause, GuardianError);
    asserts.assertEquals(client.request, undefined);
  });

  it('updates a message', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(
      JSON.stringify({
        ok: true,
        channel: 'C123ABC456',
        ts: '1401383885.000061',
        text: 'Updated text you carefully authored',
        message: {
          text: 'Updated text you carefully authored',
          user: 'U34567890',
        },
      }),
    );

    const result = await client.updateMessage({
      channel: 'C123ABC456',
      ts: '1401383885.000061',
      text: 'Updated text you carefully authored',
    });
    asserts.assertEquals(result.text, 'Updated text you carefully authored');
    asserts.assertEquals(client.request?.method, 'POST');
    asserts.assertStringIncludes(client.request?.url ?? '', '/chat.update');
  });

  it('deletes a message', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(
      JSON.stringify({
        ok: true,
        channel: 'C123ABC456',
        ts: '1401383885.000061',
      }),
    );

    const result = await client.deleteMessage({
      channel: 'C123ABC456',
      ts: '1401383885.000061',
    });
    asserts.assertEquals(result.ok, true);
    asserts.assertStringIncludes(client.request?.url ?? '', '/chat.delete');
  });

  it('lists conversations, forwarding pagination and filter params', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(
      JSON.stringify({
        ok: true,
        channels: [
          {
            id: 'C123ABC456',
            name: 'general',
            is_channel: true,
            is_archived: false,
          },
        ],
        response_metadata: { next_cursor: 'abc123' },
      }),
    );

    const result = await client.listConversations({
      cursor: 'prev-cursor',
      limit: 200,
      exclude_archived: true,
      types: 'public_channel,private_channel',
    });
    asserts.assertEquals(result.channels[0]?.name, 'general');
    asserts.assertEquals(result.response_metadata?.next_cursor, 'abc123');
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      '/conversations.list',
    );
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'cursor=prev-cursor',
    );
    asserts.assertStringIncludes(client.request?.url ?? '', 'limit=200');
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'exclude_archived=true',
    );
    asserts.assertEquals(client.request?.method, 'GET');
  });

  it('fetches conversation history', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(
      JSON.stringify({
        ok: true,
        messages: [
          { type: 'message', ts: '1512085950.000216', text: 'Sample message' },
        ],
        has_more: true,
        response_metadata: { next_cursor: 'def456' },
      }),
    );

    const result = await client.getConversationHistory({
      channel: 'C123ABC456',
      limit: 50,
    });
    asserts.assertEquals(result.messages[0]?.text, 'Sample message');
    asserts.assertEquals(result.has_more, true);
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      '/conversations.history',
    );
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'channel=C123ABC456',
    );
  });

  it('rejects getConversationHistory without a channel', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(JSON.stringify({ ok: true }));

    await asserts.assertRejects(
      // deno-lint-ignore no-explicit-any
      () => client.getConversationHistory({} as any),
      SlackError,
    );
    asserts.assertEquals(client.request, undefined);
  });

  it('looks up a user', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(
      JSON.stringify({
        ok: true,
        user: {
          id: 'U123ABC456',
          team_id: 'T123ABC',
          name: 'ada',
          real_name: 'Ada Lovelace',
          is_bot: false,
          profile: {
            email: 'ada@example.com',
            image_192: 'https://example.com/a.png',
          },
        },
      }),
    );

    const result = await client.getUserInfo('U123ABC456');
    asserts.assertEquals(result.user.real_name, 'Ada Lovelace');
    asserts.assertEquals(result.user.profile?.email, 'ada@example.com');
    asserts.assertStringIncludes(client.request?.url ?? '', '/users.info');
    asserts.assertStringIncludes(client.request?.url ?? '', 'user=U123ABC456');
  });

  it('raises RESPONSE_ERROR when a success body fails schema validation', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(
      JSON.stringify({ ok: true, channels: 'not-an-array' }),
    );

    await asserts.assertRejects(
      () => client.listConversations(),
      SlackError,
      'schema',
    );
  });

  it('maps ok:false invalid_auth to AUTH_FAILED', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(
      JSON.stringify({ ok: false, error: 'invalid_auth' }),
      200,
    );

    const error = await asserts.assertRejects(
      () => client.postMessage({ channel: 'C1', text: 'hi' }),
      SlackError,
    );
    asserts.assertEquals(error.code, 'AUTH_FAILED');
    asserts.assertEquals(error.getContextValue('vendorError'), 'invalid_auth');
  });

  it('maps ok:false channel_not_found to NOT_FOUND', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(
      JSON.stringify({ ok: false, error: 'channel_not_found' }),
      200,
    );

    const error = await asserts.assertRejects(
      () => client.postMessage({ channel: 'C1', text: 'hi' }),
      SlackError,
    );
    asserts.assertEquals(error.code, 'NOT_FOUND');
  });

  it('maps ok:false missing_scope to FORBIDDEN', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(
      JSON.stringify({ ok: false, error: 'missing_scope' }),
      200,
    );

    const error = await asserts.assertRejects(
      () => client.postMessage({ channel: 'C1', text: 'hi' }),
      SlackError,
    );
    asserts.assertEquals(error.code, 'FORBIDDEN');
  });

  it('maps ok:false not_in_channel to the dedicated NOT_IN_CHANNEL code', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(
      JSON.stringify({ ok: false, error: 'not_in_channel' }),
      200,
    );

    const error = await asserts.assertRejects(
      () => client.getConversationHistory({ channel: 'C1' }),
      SlackError,
    );
    asserts.assertEquals(error.code, 'NOT_IN_CHANNEL');
  });

  it('maps ok:false ratelimited (in a 200 body) to RATE_LIMITED', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(
      JSON.stringify({ ok: false, error: 'ratelimited' }),
      200,
    );

    const error = await asserts.assertRejects(
      () => client.postMessage({ channel: 'C1', text: 'hi' }),
      SlackError,
    );
    asserts.assertEquals(error.code, 'RATE_LIMITED');
  });

  it('falls back to UNKNOWN_ERROR for an unmapped ok:false error string', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(
      JSON.stringify({
        ok: false,
        error: 'some_future_error_slack_adds_later',
      }),
      200,
    );

    const error = await asserts.assertRejects(
      () => client.postMessage({ channel: 'C1', text: 'hi' }),
      SlackError,
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
    asserts.assertEquals(
      error.getContextValue('vendorError'),
      'some_future_error_slack_adds_later',
    );
  });

  it('maps a genuine HTTP 429 to RATE_LIMITED and threads Retry-After into context', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(null, 429, { 'retry-after': '30' });

    const error = await asserts.assertRejects(
      () => client.postMessage({ channel: 'C1', text: 'hi' }),
      SlackError,
    );
    asserts.assertEquals(error.code, 'RATE_LIMITED');
    asserts.assertEquals(error.getContextValue('retryAfter'), 30);
    asserts.assertStringIncludes(error.message, '30s');
  });

  it('falls back to a generic retry hint when Retry-After is absent', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse(null, 429, {});

    const error = await asserts.assertRejects(
      () => client.postMessage({ channel: 'C1', text: 'hi' }),
      SlackError,
    );
    asserts.assertEquals(error.code, 'RATE_LIMITED');
    asserts.assertEquals(error.getContextValue('retryAfter'), 'a few');
  });

  it('maps an HTTP 5xx to SERVICE_UNAVAILABLE', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse('<html>Internal Server Error</html>', 503, {
      'content-type': 'text/html',
    });

    const error = await asserts.assertRejects(
      () => client.postMessage({ channel: 'C1', text: 'hi' }),
      SlackError,
    );
    asserts.assertEquals(error.code, 'SERVICE_UNAVAILABLE');
  });

  it('falls back to UNKNOWN_ERROR for an unexplained non-2xx status', async () => {
    const client = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
    });
    client.setResponse('Not Found', 404, { 'content-type': 'text/plain' });

    const error = await asserts.assertRejects(
      () => client.postMessage({ channel: 'C1', text: 'hi' }),
      SlackError,
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Live tests — exercise the real Slack Web API against a live workspace.
// Skipped entirely unless CONNECTOR_SLACK_BOT_TOKEN/CONNECTOR_SLACK_CHANNEL_ID
// are both set (via env or a `.env` file — see `envArgs`), which is never
// the case in CI/sandboxed environments, so these never run unattended.
// ---------------------------------------------------------------------------
import { envArgs } from '@utils';

async function hmacHex(
  secret: string,
  message: string,
  hash = 'SHA-256',
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret) as unknown as BufferSource,
    { name: 'HMAC', hash },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(message) as unknown as BufferSource,
    ),
  );
  let out = '';
  for (const b of mac) out += b.toString(16).padStart(2, '0');
  return out;
}
function hexToB64(hex: string): string {
  let bin = '';
  for (let i = 0; i < hex.length; i += 2) {
    bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return btoa(bin);
}

describe('Slack — verifyWebhook', () => {
  const SECRET = 'slack_signing_secret';
  const NOW_MS = 1_700_000_000_000;
  const TS = String(Math.floor(NOW_MS / 1000));
  const client = () =>
    new MockSlack({ auth: { type: 'BEARER', token: 'xoxb-test' } });
  const hdrs = async (body: string, ts = TS) => ({
    'x-slack-request-timestamp': ts,
    'x-slack-signature': `v0=${await hmacHex(SECRET, `v0:${ts}:${body}`)}`,
  });
  it('accepts a genuine v0 signature and returns the raw body', async () => {
    const body = '{"type":"event_callback"}';
    asserts.assertEquals(
      await client().verifyWebhook({
        payload: body,
        headers: await hdrs(body),
        signingSecret: SECRET,
        nowMs: NOW_MS,
      }),
      body,
    );
  });
  it('passes a form-encoded slash-command body through untouched', async () => {
    const body = 'token=x&command=%2Fdeploy&text=prod';
    asserts.assertEquals(
      await client().verifyWebhook({
        payload: body,
        headers: await hdrs(body),
        signingSecret: SECRET,
        nowMs: NOW_MS,
      }),
      body,
    );
  });
  it('rejects a tampered body', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: 'b',
          headers: await hdrs('a'),
          signingSecret: SECRET,
          nowMs: NOW_MS,
        }),
      SlackError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });
  it('rejects a replay older than five minutes', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: 'a',
          headers: await hdrs('a'),
          signingSecret: SECRET,
          nowMs: NOW_MS + 301_000,
        }),
      SlackError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_TIMESTAMP_INVALID');
  });
  it('rejects missing headers', async () => {
    const err = await asserts.assertRejects(
      () =>
        client().verifyWebhook({
          payload: 'a',
          headers: {},
          signingSecret: SECRET,
          nowMs: NOW_MS,
        }),
      SlackError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_INVALID_HEADERS');
  });
  it('rejects a non-numeric timestamp as WEBHOOK_TIMESTAMP_INVALID', async () => {
    const body = '{"type":"event_callback"}';
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: body,
          headers: await hdrs(body, 'not-a-number'),
          signingSecret: SECRET,
          nowMs: NOW_MS,
        }),
      SlackError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_TIMESTAMP_INVALID');
  });
});

const env = envArgs();
const credentials = {
  botToken: env.get('CONNECTOR_SLACK_BOT_TOKEN'),
  channelId: env.get('CONNECTOR_SLACK_CHANNEL_ID'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);
// Slack has no sandbox/test-mode token — `postMessage` always delivers a
// real, visible message to real channel members, even though it's deleted
// moments later. Requiring this on top of `liveTestsEnabled` means having
// valid credentials alone is never enough to trigger a visible effect on an
// unattended schedule.
const visibleEffectsAllowed = !!env.get('LIVE_TEST_ALLOW_VISIBLE_EFFECTS');

describe('Slack — maxRetryWait (RESTler rate-limit retry)', () => {
  /**
   * A client whose every request is answered 429 with a `retry-after` hint,
   * and whose waits are recorded instead of slept. `maxRetryWait` is what
   * routes a 429 to RESTler's retry logic (and so to this connect's
   * `RESTlerRateLimitError` rewrap) — without it the vendor handler maps the
   * 429 directly, which the error-mapping tests already cover.
   */
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockSlack({
      auth: { type: 'BEARER', token: 'xoxb-test-token' },
      maxRetryWait,
    });
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
      () => c.postMessage({ channel: 'C1', text: 'hi' }),
      SlackError,
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
      () => c.postMessage({ channel: 'C1', text: 'hi' }),
      SlackError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

describe({
  name: 'Slack — live (read-only)',
  // Deno only: Bun/Node each get their own connect-wide live-test job (see
  // the repo's CI matrix), so this suite only registers on Deno — it must
  // not double-run the same live assertions three times.
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('lists real conversations visible to the configured bot token', async () => {
      const client = new Slack({
        auth: { type: 'BEARER', token: credentials.botToken! },
      });
      const { channels } = await client.listConversations({ limit: 5 });
      asserts.assertExists(channels);
    });

    it('fetches real history for the configured channel', async () => {
      const client = new Slack({
        auth: { type: 'BEARER', token: credentials.botToken! },
      });
      const { messages } = await client.getConversationHistory({
        channel: credentials.channelId!,
        limit: 5,
      });
      asserts.assertExists(messages);
    });

    it("looks up real info for the most recent message's author (skips if the channel has no messages yet)", async () => {
      const client = new Slack({
        auth: { type: 'BEARER', token: credentials.botToken! },
      });
      const { messages } = await client.getConversationHistory({
        channel: credentials.channelId!,
        limit: 1,
      });
      const authorId = messages[0]?.user;
      if (!authorId) {
        // Nothing user-authored in the configured channel yet — there's no
        // user id to look up, which is itself a valid, safe outcome.
        return;
      }
      const { user } = await client.getUserInfo(authorId);
      asserts.assertExists(user);
    });
  },
});

// This is the "genuine create+cleanup pair" pattern (the bot can delete its
// own message), but unlike a fully self-contained resource (e.g. a
// throwaway S3 object), the message IS still visible/delivered to real
// channel members for the brief window before `deleteMessage` removes it —
// so this needs the same explicit opt-in as any other visible side effect,
// not just valid credentials. Gated behind `visibleEffectsAllowed` on top
// of `liveTestsEnabled`, so it never fires unattended on a schedule even
// with full credentials configured.
describe({
  name: 'Slack — live (visible effect: postMessage + deleteMessage)',
  ignore: !liveTestsEnabled || !visibleEffectsAllowed,
  bun: false,
  node: false,
  fn: () => {
    it('posts a real message to the configured channel, then deletes it', async () => {
      const client = new Slack({
        auth: { type: 'BEARER', token: credentials.botToken! },
      });
      const posted = await client.postMessage({
        channel: credentials.channelId!,
        text: `[tundra-connect live test — ${new Date().toISOString()}]`,
      });
      try {
        asserts.assertExists(posted.ts);
      } finally {
        // Runs even if the assertion above threw, so a failed assertion
        // never leaves the synthetic message lingering in a real channel.
        await client.deleteMessage({
          channel: posted.channel,
          ts: posted.ts,
        });
      }
    });
  },
});
