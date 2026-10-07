import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import {
  Telegram,
  type TelegramWebhookHeaders,
  WEBHOOK_SECRET_HEADER,
} from './Telegram.ts';
import { TelegramError } from './errors/mod.ts';
import type { UpdateSchema } from './schema/mod.ts';

const TEST_TOKEN = '123456789:AAExampleTokenAABBCCDDEEFFGGHHIIJJKKLLMM';

class MockTelegram extends Telegram {
  public request?: {
    url: string;
    method?: string;
    body?: string;
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
        body: typeof init?.body === 'string' ? init.body : undefined,
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

const envelope = (result: unknown) => JSON.stringify({ ok: true, result });

describe('Telegram', () => {
  it('exposes validated configuration through named getters', () => {
    const client = new MockTelegram({ botToken: TEST_TOKEN });
    asserts.assertEquals(client.vendor, 'Telegram');
    // The bot token is deliberately NOT readable back off the client.
    asserts.assertEquals(
      (client as unknown as Record<string, unknown>).botToken,
      undefined,
    );
  });

  it('folds the bot token into baseURL', () => {
    const client = new MockTelegram({ botToken: TEST_TOKEN });
    client.setResponse(envelope({ id: 1, is_bot: true, first_name: 'Bot' }));
    return client.getMe().then(() => {
      asserts.assertStringIncludes(
        client.request?.url ?? '',
        `https://api.telegram.org/bot${TEST_TOKEN}/getMe`,
      );
    });
  });

  it('rejects a blank bot token', () => {
    asserts.assertThrows(
      () => new MockTelegram({ botToken: '' }),
      TelegramError,
      'non-empty string',
    );
    asserts.assertThrows(
      () => new MockTelegram({ botToken: '   ' }),
      TelegramError,
      'non-empty string',
    );
  });

  it('rejects a completely missing bot token', () => {
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => new MockTelegram({} as any),
      TelegramError,
      'non-empty string',
    );
  });

  it('rejects a bot token with no colon separator', () => {
    asserts.assertThrows(
      () => new MockTelegram({ botToken: '123456789AAExampleTokenAABB' }),
      TelegramError,
      '<bot id>:<secret>',
    );
  });

  it('rejects a bot token with a non-numeric bot id prefix', () => {
    asserts.assertThrows(
      () => new MockTelegram({ botToken: 'notanumber:AAExampleTokenAABB' }),
      TelegramError,
      '<bot id>:<secret>',
    );
  });

  it('rejects a bot token with an empty secret portion', () => {
    asserts.assertThrows(
      () => new MockTelegram({ botToken: '123456789:' }),
      TelegramError,
      '<bot id>:<secret>',
    );
  });

  it('rejects a pasted URL in place of a bot token', () => {
    asserts.assertThrows(
      () => new MockTelegram({ botToken: 'https://t.me/BotFather' }),
      TelegramError,
      '<bot id>:<secret>',
    );
  });

  it('appends /bot<token> to an explicit self-hosted baseURL override', () => {
    const client = new MockTelegram({
      botToken: TEST_TOKEN,
      baseURL: 'http://localhost:8081',
    });
    client.setResponse(envelope({ id: 1, is_bot: true, first_name: 'Bot' }));
    return client.getMe().then(() => {
      asserts.assertStringIncludes(
        client.request?.url ?? '',
        `http://localhost:8081/bot${TEST_TOKEN}/getMe`,
      );
    });
  });

  it('normalizes a trailing slash on an explicit baseURL (no double slash)', () => {
    const client = new MockTelegram({
      botToken: TEST_TOKEN,
      baseURL: 'http://localhost:8081/',
    });
    client.setResponse(envelope({ id: 1, is_bot: true, first_name: 'Bot' }));
    return client.getMe().then(() => {
      const url = client.request?.url ?? '';
      asserts.assertStringIncludes(
        url,
        `http://localhost:8081/bot${TEST_TOKEN}/getMe`,
      );
      asserts.assertNotMatch(url, /localhost:8081\/\//);
    });
  });

  it('does not double-append when baseURL already ends in /bot<token>', () => {
    const client = new MockTelegram({
      botToken: TEST_TOKEN,
      baseURL: `http://localhost:8081/bot${TEST_TOKEN}`,
    });
    client.setResponse(envelope({ id: 1, is_bot: true, first_name: 'Bot' }));
    return client.getMe().then(() => {
      const url = client.request?.url ?? '';
      asserts.assertStringIncludes(
        url,
        `http://localhost:8081/bot${TEST_TOKEN}/getMe`,
      );
      asserts.assertEquals(
        url.includes(`/bot${TEST_TOKEN}/bot${TEST_TOKEN}`),
        false,
      );
    });
  });

  describe('getMe', () => {
    it('returns the bot user via GET /getMe', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(
        envelope({
          id: 123456789,
          is_bot: true,
          first_name: 'ExampleBot',
          username: 'example_bot',
          can_join_groups: true,
          can_read_all_group_messages: false,
          supports_inline_queries: false,
        }),
      );

      const me = await client.getMe();
      asserts.assertEquals(me.username, 'example_bot');
      asserts.assertEquals(client.request?.method, 'GET');
      asserts.assertStringIncludes(client.request?.url ?? '', '/getMe');
    });

    it('raises RESPONSE_ERROR when the unwrapped result fails validation', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(envelope({ id: 'not-a-number' }));

      await asserts.assertRejects(
        () => client.getMe(),
        TelegramError,
        'did not match the expected schema',
      );
    });
  });

  describe('sendMessage', () => {
    const chat = { id: 123456789, type: 'private', first_name: 'Ada' };

    it('sends a message and returns the parsed Message', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(
        envelope({
          message_id: 1,
          date: 1735689600,
          chat,
          text: 'Hello!',
        }),
      );

      const message = await client.sendMessage({
        chat_id: 123456789,
        text: 'Hello!',
      });

      asserts.assertEquals(message.message_id, 1);
      asserts.assertEquals(message.text, 'Hello!');
      asserts.assertEquals(client.request?.method, 'POST');
      asserts.assertStringIncludes(client.request?.url ?? '', '/sendMessage');
      const body = JSON.parse(client.request?.body ?? '{}');
      asserts.assertEquals(body.chat_id, 123456789);
      asserts.assertEquals(body.text, 'Hello!');
    });

    it('rejects a locally invalid request before making a network call', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(envelope({}));

      await asserts.assertRejects(
        () =>
          client.sendMessage({
            chat_id: 123456789,
            text: '',
          }),
        TelegramError,
      );
      asserts.assertEquals(client.request, undefined);
    });

    it('maps 400 Bad Request to BAD_REQUEST', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(
        JSON.stringify({
          ok: false,
          error_code: 400,
          description: 'Bad Request: chat not found',
        }),
        400,
      );

      const error = await asserts.assertRejects(
        () => client.sendMessage({ chat_id: 1, text: 'hi' }),
        TelegramError,
      );
      asserts.assertEquals(error.getContextValue('errorCode'), 400);
      asserts.assertStringIncludes(error.message, 'chat not found');
    });

    it('maps 401 Unauthorized to AUTH_FAILED', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(
        JSON.stringify({
          ok: false,
          error_code: 401,
          description: 'Unauthorized',
        }),
        401,
      );

      await asserts.assertRejects(
        () => client.sendMessage({ chat_id: 1, text: 'hi' }),
        TelegramError,
        'bot token',
      );
    });

    it('maps 403 Forbidden to FORBIDDEN', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(
        JSON.stringify({
          ok: false,
          error_code: 403,
          description: 'Forbidden: bot was blocked by the user',
        }),
        403,
      );

      await asserts.assertRejects(
        () => client.sendMessage({ chat_id: 1, text: 'hi' }),
        TelegramError,
        'blocked by the user',
      );
    });

    it('maps 404 Not Found to NOT_FOUND', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(
        JSON.stringify({
          ok: false,
          error_code: 404,
          description: 'Not Found',
        }),
        404,
      );

      await asserts.assertRejects(
        () => client.sendMessage({ chat_id: 1, text: 'hi' }),
        TelegramError,
        'not found',
      );
    });

    it('maps 429 Too Many Requests to RATE_LIMITED and carries retry_after', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(
        JSON.stringify({
          ok: false,
          error_code: 429,
          description: 'Too Many Requests: retry after 30',
          parameters: { retry_after: 30 },
        }),
        429,
      );

      const error = await asserts.assertRejects(
        () => client.sendMessage({ chat_id: 1, text: 'hi' }),
        TelegramError,
        'retry after 30',
      );
      asserts.assertEquals(error.code, 'RATE_LIMITED');
      asserts.assertEquals(error.getContextValue('retryAfter'), 30);
    });

    it('maps error_code 429 to RATE_LIMITED even when the HTTP status is 200', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(
        JSON.stringify({
          ok: false,
          error_code: 429,
          description: 'Too Many Requests: retry after 5',
          parameters: { retry_after: 5 },
        }),
        200,
      );

      const error = await asserts.assertRejects(
        () => client.sendMessage({ chat_id: 1, text: 'hi' }),
        TelegramError,
        'retry after 5',
      );
      asserts.assertEquals(error.code, 'RATE_LIMITED');
      asserts.assertEquals(error.getContextValue('errorCode'), 429);
      asserts.assertEquals(error.getContextValue('retryAfter'), 5);
    });

    it('maps a 429 without retry_after to a message with no unpopulated placeholder', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(
        JSON.stringify({
          ok: false,
          error_code: 429,
          description: 'Too Many Requests',
        }),
        429,
      );

      const error = await asserts.assertRejects(
        () => client.sendMessage({ chat_id: 1, text: 'hi' }),
        TelegramError,
        'retry after',
      );
      asserts.assertNotMatch(error.message, /\$\{/);
    });

    it('maps a 400 without a description to a message with no unpopulated placeholder', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(
        JSON.stringify({
          ok: false,
          error_code: 400,
        }),
        400,
      );

      const error = await asserts.assertRejects(
        () => client.sendMessage({ chat_id: 1, text: 'hi' }),
        TelegramError,
        'no further details provided',
      );
      asserts.assertNotMatch(error.message, /\$\{/);
    });

    it('maps a 5xx response to SERVICE_UNAVAILABLE', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(
        JSON.stringify({
          ok: false,
          error_code: 500,
          description: 'Internal Server Error',
        }),
        500,
      );

      await asserts.assertRejects(
        () => client.sendMessage({ chat_id: 1, text: 'hi' }),
        TelegramError,
        'unavailable',
      );
    });

    it('falls back to SERVICE_UNAVAILABLE for an unparseable 5xx body', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse('<html>Bad Gateway</html>', 502, {
        'content-type': 'text/html',
      });

      await asserts.assertRejects(
        () => client.sendMessage({ chat_id: 1, text: 'hi' }),
        TelegramError,
        'unavailable',
      );
    });

    it('falls back to UNKNOWN_ERROR for an unmapped status', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(
        JSON.stringify({
          ok: false,
          error_code: 418,
          description: "I'm a teapot",
        }),
        418,
      );

      await asserts.assertRejects(
        () => client.sendMessage({ chat_id: 1, text: 'hi' }),
        TelegramError,
        'unknown error',
      );
    });

    it('migrate_to_chat_id is carried as diagnostic metadata', async () => {
      const client = new MockTelegram({ botToken: TEST_TOKEN });
      client.setResponse(
        JSON.stringify({
          ok: false,
          error_code: 400,
          description:
            'Bad Request: group chat was upgraded to a supergroup chat',
          parameters: { migrate_to_chat_id: -1001234567890 },
        }),
        400,
      );

      const error = await asserts.assertRejects(
        () => client.sendMessage({ chat_id: 1, text: 'hi' }),
        TelegramError,
      );
      asserts.assertEquals(
        error.getContextValue('migrateToChatId'),
        -1001234567890,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Live test — exercises the real Telegram Bot API. Skipped entirely unless
// CONNECTOR_TELEGRAM_BOT_TOKEN/CONNECTOR_TELEGRAM_CHAT_ID are both set (via
// env or a `.env` file — see `envArgs`). `getMe` is a read-only identity
// check with no visible side effect, so it runs on credentials alone;
// `sendMessage` posts a real message that is visible until the test's own
// `deleteMessage` cleanup runs, so it additionally requires
// LIVE_TEST_ALLOW_VISIBLE_EFFECTS. The webhook and command-menu methods are
// not live-tested: they would replace the bot's real webhook and menu.
// ---------------------------------------------------------------------------
/** Everything an error could surface to a log: its message plus its serialized context. */
function dumpError(err: unknown): string {
  const e = err as { message?: string; toJSON?: () => unknown };
  return `${e.message ?? ''} ${JSON.stringify(e.toJSON?.() ?? String(err))}`;
}

describe('Telegram — credential custody', () => {
  it('does not echo a rejected bot token into the config error', () => {
    // Regression: both CONFIG_INVALID_BOT_TOKEN sites used to carry the
    // supplied token in context. "Invalid" includes a real token with a
    // stray newline from an env file, so this is a genuine credential.
    const err = asserts.assertThrows(
      () => new MockTelegram({ botToken: 'not-a-token-SECRETMARKER' }),
      TelegramError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_BOT_TOKEN');
    asserts.assert(!dumpError(err).includes('SECRETMARKER'));
  });

  it('never leaks the bot token from a runtime failure, even though it is embedded in the URL path', async () => {
    const client = new MockTelegram({ botToken: TEST_TOKEN });
    client.setResponse(JSON.stringify({ ok: false, description: 'boom' }), 500);
    const err = await asserts.assertRejects(
      () => client.getMe(),
      TelegramError,
    );
    asserts.assert(!dumpError(err).includes(TEST_TOKEN));
  });
});

const env = envArgs();
const credentials = {
  botToken: env.get('CONNECTOR_TELEGRAM_BOT_TOKEN'),
  chatId: env.get('CONNECTOR_TELEGRAM_CHAT_ID'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);
const visibleEffectsAllowed = !!env.get('LIVE_TEST_ALLOW_VISIBLE_EFFECTS');

describe('Telegram — transport failures', () => {
  // The token is in the URL path, which RESTler's own redaction doesn't
  // cover — every error below is checked for it.
  it('throws a transient TIMEOUT when no answer arrives within the timeout', async () => {
    const c = new MockTelegram({ botToken: TEST_TOKEN, timeout: 1 });
    c['_fetch'] = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason));
      });
    const err = await asserts.assertRejects(
      () => c.getMe(),
      TelegramError,
    );
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1);
    asserts.assertEquals(dumpError(err).includes(TEST_TOKEN), false);
  });

  it('throws a transient NETWORK_ERROR when fetch itself fails', async () => {
    const c = new MockTelegram({ botToken: TEST_TOKEN });
    c['_fetch'] = () => Promise.reject(new TypeError('error sending request'));
    const err = await asserts.assertRejects(
      () => c.getMe(),
      TelegramError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(
      JSON.stringify(err.toJSON()).includes(TEST_TOKEN),
      false,
    );
    asserts.assertEquals(dumpError(err).includes(TEST_TOKEN), false);
  });

  it('scrubs the token from a fetch error message that embeds the URL', async () => {
    // Deno's message is `error sending request for url (<url>)`.
    const c = new MockTelegram({ botToken: TEST_TOKEN });
    c['_fetch'] = (input) =>
      Promise.reject(new TypeError(`error sending request for url (${input})`));
    const err = await asserts.assertRejects(
      () => c.getMe(),
      TelegramError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(dumpError(err).includes(TEST_TOKEN), false);
    asserts.assertStringIncludes(dumpError(err), '/bot[REDACTED]/getMe');
  });

  it('scrubs the token from a RESPONSE_ERROR cause', async () => {
    const c = new MockTelegram({ botToken: TEST_TOKEN });
    c.setResponse(envelope({ unexpected: true }));
    const err = await asserts.assertRejects(
      () => c.getMe(),
      TelegramError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
    asserts.assertEquals(err.transient, false);
    asserts.assertEquals(dumpError(err).includes(TEST_TOKEN), false);
  });

  it('flags a 5xx as transient and a refusal as not', async () => {
    const c = new MockTelegram({ botToken: TEST_TOKEN });
    c.setResponse('<html>502</html>', 502, { 'content-type': 'text/html' });
    const outage = await asserts.assertRejects(
      () => c.getMe(),
      TelegramError,
    );
    asserts.assertEquals(outage.code, 'SERVICE_UNAVAILABLE');
    asserts.assertEquals(outage.transient, true);

    c.setResponse(
      JSON.stringify({
        ok: false,
        error_code: 401,
        description: 'Unauthorized',
      }),
      401,
    );
    const refusal = await asserts.assertRejects(
      () => c.getMe(),
      TelegramError,
    );
    asserts.assertEquals(refusal.code, 'AUTH_FAILED');
    asserts.assertEquals(refusal.transient, false);
  });
});

describe('Telegram — maxRetryWait (RESTler rate-limit retry)', () => {
  /**
   * A client whose every request is answered 429 with a `retry-after` hint,
   * and whose waits are recorded instead of slept. `maxRetryWait` is what
   * routes a 429 to RESTler's retry logic (and so to this connect's
   * `RESTlerRateLimitError` rewrap) — without it the vendor handler maps the
   * 429 directly, which the error-mapping tests already cover.
   */
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockTelegram({ botToken: TEST_TOKEN, maxRetryWait });
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
      () => c.sendMessage({ chat_id: 1, text: 'hi' }),
      TelegramError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 1);
    asserts.assertEquals(slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws RATE_LIMITED immediately with retried: false when the hint exceeds maxRetryWait', async () => {
    const { c, slept, calls } = throttled(5, '120');
    const err = await asserts.assertRejects(
      () => c.sendMessage({ chat_id: 1, text: 'hi' }),
      TelegramError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    // The rewrapped RESTler error (its `cause`) carries the request URL.
    asserts.assertEquals(dumpError(err).includes(TEST_TOKEN), false);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

describe('Telegram — unrecognised error responses', () => {
  it('fails RESPONSE_ERROR for an unmapped 4xx with no Bot API envelope', async () => {
    const c = new MockTelegram({ botToken: TEST_TOKEN });
    c.setResponse('teapot', 418);
    const err = await asserts.assertRejects(
      () => c.sendMessage({ chat_id: 1, text: 'hi' }),
      TelegramError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });
});

describe('Telegram — a 429 without the vendor envelope', () => {
  it('is still RATE_LIMITED (mapped by status), with the retry hint', async () => {
    // What a proxy or CDN in front of the API returns: the status and a
    // Retry-After header, but not the vendor's own error body.
    const c = new MockTelegram({ botToken: TEST_TOKEN });
    c['_fetch'] = () =>
      Promise.resolve(
        new Response('{}', {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '7' },
        }),
      );
    const err = await asserts.assertRejects(
      () => c.sendMessage({ chat_id: 1, text: 'hi' }),
      TelegramError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 7);
  });
});

describe('Telegram — endpoint wiring', () => {
  const chat = { id: -1001234567890, type: 'supergroup', title: 'Ops' };
  const message = { message_id: 42, date: 1735689600, chat, text: 'x' };
  const SECRET = 'S3cret_token-for-tests';

  /** Calls `fn` against a client answering `result`, returns the recorded request. */
  const call = async (
    result: unknown,
    fn: (c: MockTelegram) => Promise<unknown>,
  ) => {
    const c = new MockTelegram({ botToken: TEST_TOKEN });
    c.setResponse(envelope(result));
    const value = await fn(c);
    const body = c.request?.body === undefined
      ? undefined
      : JSON.parse(c.request.body);
    return {
      value,
      url: c.request?.url ?? '',
      method: c.request?.method,
      body,
    };
  };

  const cases: Array<{
    name: string;
    path: string;
    method: string;
    result: unknown;
    run: (c: MockTelegram) => Promise<unknown>;
    body: unknown;
  }> = [
    {
      name: 'setWebhook',
      path: '/setWebhook',
      method: 'POST',
      result: true,
      run: (c) =>
        c.setWebhook({
          url: 'https://bot.example.com/telegram',
          secret_token: SECRET,
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: true,
          max_connections: 10,
        }),
      body: {
        url: 'https://bot.example.com/telegram',
        secret_token: SECRET,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
        max_connections: 10,
      },
    },
    {
      name: 'deleteWebhook',
      path: '/deleteWebhook',
      method: 'POST',
      result: true,
      run: (c) => c.deleteWebhook({ drop_pending_updates: true }),
      body: { drop_pending_updates: true },
    },
    {
      name: 'deleteWebhook (no options)',
      path: '/deleteWebhook',
      method: 'POST',
      result: true,
      run: (c) => c.deleteWebhook(),
      body: {},
    },
    {
      name: 'getWebhookInfo',
      path: '/getWebhookInfo',
      method: 'GET',
      result: {
        url: 'https://bot.example.com/telegram',
        has_custom_certificate: false,
        pending_update_count: 0,
      },
      run: (c) => c.getWebhookInfo(),
      body: undefined,
    },
    {
      name: 'setMyCommands',
      path: '/setMyCommands',
      method: 'POST',
      result: true,
      run: (c) =>
        c.setMyCommands({
          commands: [{ command: 'status', description: 'Service status' }],
          scope: { type: 'chat_administrators', chat_id: -1001234567890 },
          language_code: 'en',
        }),
      body: {
        commands: [{ command: 'status', description: 'Service status' }],
        scope: { type: 'chat_administrators', chat_id: -1001234567890 },
        language_code: 'en',
      },
    },
    {
      name: 'getMyCommands',
      path: '/getMyCommands',
      method: 'POST',
      result: [{ command: 'status', description: 'Service status' }],
      run: (c) => c.getMyCommands({ scope: { type: 'all_private_chats' } }),
      body: { scope: { type: 'all_private_chats' } },
    },
    {
      name: 'deleteMyCommands',
      path: '/deleteMyCommands',
      method: 'POST',
      result: true,
      run: (c) => c.deleteMyCommands(),
      body: {},
    },
    {
      name: 'sendMessage',
      path: '/sendMessage',
      method: 'POST',
      result: message,
      run: (c) =>
        c.sendMessage({
          chat_id: -1001234567890,
          text: '<b>Sales</b>: 3 new orgs',
          parse_mode: 'HTML',
          disable_notification: true,
          link_preview_options: { is_disabled: true },
          reply_parameters: { message_id: 7 },
          reply_markup: {
            inline_keyboard: [[
              { text: 'Open', url: 'https://example.com/sales' },
              { text: 'Mute 1h', callback_data: 'mute:sales:3600' },
            ]],
          },
        }),
      body: {
        chat_id: -1001234567890,
        text: '<b>Sales</b>: 3 new orgs',
        parse_mode: 'HTML',
        disable_notification: true,
        link_preview_options: { is_disabled: true },
        reply_parameters: { message_id: 7 },
        reply_markup: {
          inline_keyboard: [[
            { text: 'Open', url: 'https://example.com/sales' },
            { text: 'Mute 1h', callback_data: 'mute:sales:3600' },
          ]],
        },
      },
    },
    {
      name: 'editMessageText',
      path: '/editMessageText',
      method: 'POST',
      result: message,
      run: (c) =>
        c.editMessageText({
          chat_id: -1001234567890,
          message_id: 42,
          text: 'Resolved',
        }),
      body: { chat_id: -1001234567890, message_id: 42, text: 'Resolved' },
    },
    {
      name: 'editMessageReplyMarkup',
      path: '/editMessageReplyMarkup',
      method: 'POST',
      result: message,
      run: (c) =>
        c.editMessageReplyMarkup({
          chat_id: -1001234567890,
          message_id: 42,
          reply_markup: { inline_keyboard: [] },
        }),
      body: {
        chat_id: -1001234567890,
        message_id: 42,
        reply_markup: { inline_keyboard: [] },
      },
    },
    {
      name: 'answerCallbackQuery',
      path: '/answerCallbackQuery',
      method: 'POST',
      result: true,
      run: (c) =>
        c.answerCallbackQuery({
          callback_query_id: 'q1',
          text: 'Muted',
          show_alert: false,
          cache_time: 5,
        }),
      body: {
        callback_query_id: 'q1',
        text: 'Muted',
        show_alert: false,
        cache_time: 5,
      },
    },
    {
      name: 'deleteMessage',
      path: '/deleteMessage',
      method: 'POST',
      result: true,
      run: (c) => c.deleteMessage({ chat_id: -1001234567890, message_id: 42 }),
      body: { chat_id: -1001234567890, message_id: 42 },
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.name} → ${testCase.method} ${testCase.path}`, async () => {
      const { value, url, method, body } = await call(
        testCase.result,
        testCase.run,
      );
      asserts.assert(
        url.endsWith(`/bot${TEST_TOKEN}${testCase.path}`),
        url,
      );
      asserts.assertEquals(method, testCase.method);
      asserts.assertEquals(body, testCase.body);
      asserts.assertEquals(value, testCase.result);
    });
  }

  it('editMessageText returns true for an inline message', async () => {
    const { value, body } = await call(true, (c) =>
      c.editMessageText({
        inline_message_id: 'AAAAAgAAAB',
        text: 'Resolved',
      }));
    asserts.assertEquals(value, true);
    asserts.assertEquals(body, {
      inline_message_id: 'AAAAAgAAAB',
      text: 'Resolved',
    });
  });

  it('editMessageReplyMarkup returns true for an inline message', async () => {
    const { value } = await call(
      true,
      (c) => c.editMessageReplyMarkup({ inline_message_id: 'AAAAAgAAAB' }),
    );
    asserts.assertEquals(value, true);
  });

  it('getMyCommands returns [] when no commands are set', async () => {
    const { value } = await call([], (c) => c.getMyCommands());
    asserts.assertEquals(value, []);
  });

  it('raises RESPONSE_ERROR when a true-returning method gets something else', async () => {
    const c = new MockTelegram({ botToken: TEST_TOKEN });
    c.setResponse(envelope(false));
    const err = await asserts.assertRejects(
      () => c.deleteMessage({ chat_id: 1, message_id: 2 }),
      TelegramError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });
});

describe('Telegram — local validation never sends', () => {
  const invalid: Array<[string, (c: MockTelegram) => Promise<unknown>]> = [
    [
      'setWebhook with an http url',
      (c) =>
        c.setWebhook({ url: 'http://bot.example.com/t', secret_token: 'abc' }),
    ],
    [
      'setWebhook with an invalid secret_token',
      (c) =>
        c.setWebhook({
          url: 'https://bot.example.com/t',
          secret_token: 'has spaces',
        }),
    ],
    [
      'setWebhook with max_connections 101',
      (c) =>
        c.setWebhook({
          url: 'https://bot.example.com/t',
          secret_token: 'abc',
          max_connections: 101,
        }),
    ],
    [
      'deleteWebhook with a string boolean',
      (c) =>
        c.deleteWebhook({
          drop_pending_updates: 'true' as unknown as boolean,
        }),
    ],
    [
      'setMyCommands with an uppercase command',
      (c) =>
        c.setMyCommands({
          commands: [{ command: 'Status', description: 'x' }],
        }),
    ],
    [
      'getMyCommands with an unknown scope',
      (c) =>
        c.getMyCommands({
          scope: { type: 'everyone' } as unknown as { type: 'default' },
        }),
    ],
    [
      'deleteMyCommands with a bad language_code',
      (c) => c.deleteMyCommands({ language_code: 'english' }),
    ],
    [
      'sendMessage with a 65-byte callback_data',
      (c) =>
        c.sendMessage({
          chat_id: 1,
          text: 'x',
          reply_markup: {
            inline_keyboard: [[{ text: 'b', callback_data: 'é'.repeat(33) }]],
          },
        }),
    ],
    [
      'sendMessage with a 4097-character text',
      (c) => c.sendMessage({ chat_id: 1, text: 'a'.repeat(4097) }),
    ],
    [
      'editMessageText with both target forms',
      (c) =>
        c.editMessageText({
          chat_id: 1,
          message_id: 2,
          inline_message_id: 'x',
          text: 'y',
        } as never),
    ],
    [
      'editMessageReplyMarkup with no target',
      (c) => c.editMessageReplyMarkup({} as never),
    ],
    [
      'answerCallbackQuery with 201 characters of text',
      (c) =>
        c.answerCallbackQuery({
          callback_query_id: 'q',
          text: 'a'.repeat(201),
        }),
    ],
    [
      'deleteMessage with an unknown key',
      (c) =>
        c.deleteMessage(
          { chat_id: 1, message_id: 2, revoke: true } as unknown as {
            chat_id: number;
            message_id: number;
          },
        ),
    ],
  ];

  for (const [name, run] of invalid) {
    it(name, async () => {
      const c = new MockTelegram({ botToken: TEST_TOKEN });
      c.setResponse(envelope(true));
      const err = await asserts.assertRejects(() => run(c), TelegramError);
      asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
      asserts.assertEquals(err.transient, false);
      asserts.assertEquals(c.request, undefined);
    });
  }

  it('never repeats an invalid secret_token in the error', async () => {
    const c = new MockTelegram({ botToken: TEST_TOKEN });
    c.setResponse(envelope(true));
    const err = await asserts.assertRejects(
      () =>
        c.setWebhook({
          url: 'https://bot.example.com/t',
          secret_token: 'SECRETMARKER with space',
        }),
      TelegramError,
    );
    asserts.assert(!dumpError(err).includes('SECRETMARKER'));
  });

  it('never repeats secret_token when Telegram refuses setWebhook', async () => {
    const c = new MockTelegram({ botToken: TEST_TOKEN });
    c.setResponse(
      JSON.stringify({
        ok: false,
        error_code: 400,
        description: 'Bad Request: bad webhook: Failed to resolve host',
      }),
      400,
    );
    const err = await asserts.assertRejects(
      () =>
        c.setWebhook({
          url: 'https://bot.example.com/t',
          secret_token: 'SECRETMARKER',
        }),
      TelegramError,
    );
    asserts.assertEquals(err.code, 'BAD_REQUEST');
    asserts.assert(!dumpError(err).includes('SECRETMARKER'));
  });
});

describe('Telegram — flood control (429)', () => {
  it('carries parameters.retry_after as a transient RATE_LIMITED with retryAfterSeconds', async () => {
    const c = new MockTelegram({ botToken: TEST_TOKEN });
    c.setResponse(
      JSON.stringify({
        ok: false,
        error_code: 429,
        description: 'Too Many Requests: retry after 30',
        parameters: { retry_after: 30 },
      }),
      429,
    );
    const err = await asserts.assertRejects(
      () => c.answerCallbackQuery({ callback_query_id: 'q' }),
      TelegramError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 30);
    asserts.assertEquals(err.getContextValue('retryAfter'), 30);
  });

  it('prefers the body hint over a Retry-After header', async () => {
    const c = new MockTelegram({ botToken: TEST_TOKEN });
    c.setResponse(
      JSON.stringify({
        ok: false,
        error_code: 429,
        description: 'Too Many Requests: retry after 12',
        parameters: { retry_after: 12 },
      }),
      429,
      { 'content-type': 'application/json', 'retry-after': '3' },
    );
    const err = await asserts.assertRejects(
      () => c.sendMessage({ chat_id: 1, text: 'hi' }),
      TelegramError,
    );
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 12);
  });

  it('falls back to a Retry-After header when the body has no hint', async () => {
    const c = new MockTelegram({ botToken: TEST_TOKEN });
    c.setResponse(
      JSON.stringify({
        ok: false,
        error_code: 429,
        description: 'Too Many Requests',
      }),
      429,
      { 'content-type': 'application/json', 'retry-after': '4' },
    );
    const err = await asserts.assertRejects(
      () => c.sendMessage({ chat_id: 1, text: 'hi' }),
      TelegramError,
    );
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 4);
  });
});

describe('Telegram.verifyWebhookRequest', () => {
  const SECRET = 'S3cret_token-for-tests';
  const UPDATE = {
    update_id: 1001,
    message: {
      message_id: 7,
      date: 1735689600,
      chat: { id: 42, type: 'private', first_name: 'Ada' },
      from: { id: 42, is_bot: false, first_name: 'Ada' },
      text: '/status',
      entities: [{ type: 'bot_command', offset: 0, length: 7 }],
    },
  };
  const BODY = JSON.stringify(UPDATE);

  const verify = (
    headers: TelegramWebhookHeaders,
    body = BODY,
    secretToken = SECRET,
  ) => Telegram.verifyWebhookRequest({ headers, body, secretToken });

  const rejects = (
    run: () => unknown,
    code: string,
  ): TelegramError => {
    const err = asserts.assertThrows(run, TelegramError);
    asserts.assertEquals(err.code, code);
    asserts.assertEquals(err.transient, false);
    asserts.assert(!dumpError(err).includes(SECRET), 'secret leaked');
    return err;
  };

  it('accepts a matching secret from a Headers instance', () => {
    const update = verify(
      new Headers({ 'X-Telegram-Bot-Api-Secret-Token': SECRET }),
    );
    asserts.assertEquals(update.update_id, 1001);
    asserts.assertEquals(update.message?.text, '/status');
  });

  it('accepts a matching secret from a plain object, case-insensitively', () => {
    asserts.assertEquals(
      verify({ 'x-telegram-bot-api-secret-token': SECRET }).update_id,
      1001,
    );
    asserts.assertEquals(
      verify({ 'X-TELEGRAM-BOT-API-SECRET-TOKEN': [SECRET] }).update_id,
      1001,
    );
  });

  it('refuses a wrong secret', () => {
    rejects(
      () => verify({ [WEBHOOK_SECRET_HEADER]: 'S3cret_token-for-test' }),
      'WEBHOOK_SECRET_INVALID',
    );
    rejects(
      () => verify({ [WEBHOOK_SECRET_HEADER]: SECRET + 'x' }),
      'WEBHOOK_SECRET_INVALID',
    );
  });

  it('refuses a header longer than any valid secret', () => {
    rejects(
      () => verify({ [WEBHOOK_SECRET_HEADER]: 'a'.repeat(10_000) }),
      'WEBHOOK_SECRET_INVALID',
    );
  });

  it('refuses a missing or empty header', () => {
    rejects(() => verify(new Headers()), 'WEBHOOK_SECRET_MISSING');
    rejects(() => verify({}), 'WEBHOOK_SECRET_MISSING');
    rejects(
      () => verify({ [WEBHOOK_SECRET_HEADER]: '' }),
      'WEBHOOK_SECRET_MISSING',
    );
    rejects(
      () => verify({ [WEBHOOK_SECRET_HEADER]: undefined }),
      'WEBHOOK_SECRET_MISSING',
    );
  });

  it('refuses an unset or invalid configured secret, even with no header', () => {
    rejects(() => verify({}, BODY, ''), 'CONFIG_INVALID_WEBHOOK_SECRET');
    rejects(
      () => verify({ [WEBHOOK_SECRET_HEADER]: '' }, BODY, ''),
      'CONFIG_INVALID_WEBHOOK_SECRET',
    );
    rejects(
      () =>
        Telegram.verifyWebhookRequest({
          headers: {},
          body: BODY,
          secretToken: undefined as unknown as string,
        }),
      'CONFIG_INVALID_WEBHOOK_SECRET',
    );
    const err = rejects(
      () =>
        verify(
          { [WEBHOOK_SECRET_HEADER]: 'bad secret!' },
          BODY,
          'bad secret!',
        ),
      'CONFIG_INVALID_WEBHOOK_SECRET',
    );
    asserts.assert(!dumpError(err).includes('bad secret!'));
  });

  it('checks the secret before parsing the body', () => {
    rejects(
      () => verify({ [WEBHOOK_SECRET_HEADER]: 'wrong' }, '{not json'),
      'WEBHOOK_SECRET_INVALID',
    );
  });

  it('refuses a malformed JSON body', () => {
    rejects(
      () => verify({ [WEBHOOK_SECRET_HEADER]: SECRET }, '{"update_id": 1,'),
      'WEBHOOK_MALFORMED_BODY',
    );
    rejects(
      () => verify({ [WEBHOOK_SECRET_HEADER]: SECRET }, ''),
      'WEBHOOK_MALFORMED_BODY',
    );
    rejects(
      () =>
        verify(
          { [WEBHOOK_SECRET_HEADER]: SECRET },
          UPDATE as unknown as string,
        ),
      'WEBHOOK_MALFORMED_BODY',
    );
  });

  it('refuses JSON that is not an Update', () => {
    for (const body of ['[]', '"x"', 'null', '{"message":{}}']) {
      const err = rejects(
        () => verify({ [WEBHOOK_SECRET_HEADER]: SECRET }, body),
        'WEBHOOK_INVALID_UPDATE',
      );
      asserts.assertNotMatch(err.message, /\$\{/);
    }
  });

  it('accepts an update of a kind this package does not model', () => {
    const update = verify(
      { [WEBHOOK_SECRET_HEADER]: SECRET },
      JSON.stringify({ update_id: 5, some_future_kind: { x: 1 } }),
    );
    asserts.assertEquals(Telegram.updateKind(update), 'unknown');
  });
});

describe('Telegram.updateKind', () => {
  it('names the update kind', () => {
    const msg = {
      message_id: 1,
      date: 1,
      chat: { id: 1, type: 'private' as const },
    };
    asserts.assertEquals(
      Telegram.updateKind({ update_id: 1, message: msg }),
      'message',
    );
    asserts.assertEquals(
      Telegram.updateKind({ update_id: 1, edited_message: msg }),
      'edited_message',
    );
    asserts.assertEquals(
      Telegram.updateKind({
        update_id: 1,
        callback_query: {
          id: 'q',
          from: { id: 1, is_bot: false, first_name: 'A' },
          chat_instance: 'c',
        },
      }),
      'callback_query',
    );
    asserts.assertEquals(
      Telegram.updateKind(
        { update_id: 1, poll_answer: {} } as unknown as UpdateSchema,
      ),
      'poll_answer',
    );
    asserts.assertEquals(Telegram.updateKind({ update_id: 1 }), 'unknown');
  });
});

describe('Telegram.parseCommand', () => {
  const entity = (length: number, offset = 0) => [
    { type: 'bot_command', offset, length },
  ];

  it('parses a bare command with arguments', () => {
    asserts.assertEquals(Telegram.parseCommand('/org acme'), {
      command: 'org',
      args: ['acme'],
      rawArgs: 'acme',
    });
  });

  it('parses a command with no arguments', () => {
    asserts.assertEquals(Telegram.parseCommand('/status'), {
      command: 'status',
      args: [],
      rawArgs: '',
    });
  });

  it('lowercases the command', () => {
    asserts.assertEquals(Telegram.parseCommand('/STATUS')?.command, 'status');
    asserts.assertEquals(
      Telegram.parseCommand('/Today@BrevilyBot', 'brevilybot')?.command,
      'today',
    );
  });

  it('collapses extra whitespace in args but keeps rawArgs unsplit', () => {
    asserts.assertEquals(
      Telegram.parseCommand('/link   https://x.example/a  \n  note here  '),
      {
        command: 'link',
        args: ['https://x.example/a', 'note', 'here'],
        rawArgs: 'https://x.example/a  \n  note here',
      },
    );
  });

  it('accepts a command addressed to this bot, case-insensitively', () => {
    asserts.assertEquals(
      Telegram.parseCommand('/status@BrevilyBot', 'brevilybot'),
      { command: 'status', args: [], rawArgs: '', botUsername: 'BrevilyBot' },
    );
    asserts.assertEquals(
      Telegram.parseCommand('/status@brevilybot now', '@BrevilyBot')?.args,
      ['now'],
    );
  });

  it('returns null for a command addressed to another bot', () => {
    asserts.assertEquals(
      Telegram.parseCommand('/status@OtherBot', 'BrevilyBot'),
      null,
    );
  });

  it('returns any addressed command when no bot username is given', () => {
    asserts.assertEquals(
      Telegram.parseCommand('/status@OtherBot')?.botUsername,
      'OtherBot',
    );
  });

  it('returns null for text that is not a command', () => {
    for (
      const text of [
        'hello',
        '',
        ' /status',
        '/',
        '/ status',
        '/status-x',
        '//x',
      ]
    ) {
      asserts.assertEquals(Telegram.parseCommand(text), null, text);
    }
  });

  it('uses the bot_command entity at offset 0 when entities are given', () => {
    asserts.assertEquals(
      Telegram.parseCommand({
        text: '/week@BrevilyBot  acme',
        entities: entity(16),
      }, 'BrevilyBot'),
      {
        command: 'week',
        args: ['acme'],
        rawArgs: 'acme',
        botUsername: 'BrevilyBot',
      },
    );
  });

  it('returns null when the entities mark no command at offset 0', () => {
    asserts.assertEquals(
      Telegram.parseCommand({ text: '/status', entities: [] }),
      null,
    );
    asserts.assertEquals(
      Telegram.parseCommand({
        text: '/status',
        entities: [{ type: 'bold', offset: 0, length: 7 }],
      }),
      null,
    );
    asserts.assertEquals(
      Telegram.parseCommand({ text: 'see /status', entities: entity(7, 4) }),
      null,
    );
  });

  it('parses the text when the message has no entities', () => {
    asserts.assertEquals(
      Telegram.parseCommand({ text: '/flagged 10' })?.args,
      ['10'],
    );
    asserts.assertEquals(Telegram.parseCommand({}), null);
  });

  it('splits multibyte arguments on UTF-16 entity offsets', () => {
    asserts.assertEquals(
      Telegram.parseCommand({ text: '/org Ünïcödé 😀', entities: entity(4) }),
      { command: 'org', args: ['Ünïcödé', '😀'], rawArgs: 'Ünïcödé 😀' },
    );
  });
});

describe({
  name: 'Telegram — live (getMe)',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('fetches the real bot identity', async () => {
      const client = new Telegram({ botToken: credentials.botToken! });

      const me = await client.getMe();

      asserts.assertEquals(me.is_bot, true);
    });
  },
});

// Sends a real, visible message — gated behind LIVE_TEST_ALLOW_VISIBLE_EFFECTS
// so it never fires on the unattended monthly schedule.
describe({
  name: 'Telegram — live (sendMessage)',
  ignore: !liveTestsEnabled || !visibleEffectsAllowed,
  bun: false,
  node: false,
  fn: () => {
    it('sends, edits and deletes a real message in the configured chat', async () => {
      const client = new Telegram({ botToken: credentials.botToken! });

      const message = await client.sendMessage({
        chat_id: credentials.chatId!,
        text: `[tundra-connect live test — ${new Date().toISOString()}]`,
        reply_markup: {
          inline_keyboard: [[{ text: 'test', callback_data: 'live-test' }]],
        },
      });
      try {
        asserts.assertExists(message.message_id);
        const edited = await client.editMessageReplyMarkup({
          chat_id: message.chat.id,
          message_id: message.message_id,
        });
        asserts.assert(edited !== true);
      } finally {
        await client.deleteMessage({
          chat_id: message.chat.id,
          message_id: message.message_id,
        });
      }
    });
  },
});
