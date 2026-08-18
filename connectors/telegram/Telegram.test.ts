import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { Telegram } from './Telegram.ts';
import { TelegramError } from './errors/mod.ts';

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
    asserts.assertEquals(client.botToken, TEST_TOKEN);
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
// `sendMessage` (there is no delete-message method on this connect) posts
// a real, visible message and additionally requires
// LIVE_TEST_ALLOW_VISIBLE_EFFECTS.
// ---------------------------------------------------------------------------
const env = envArgs();
const credentials = {
  botToken: env.get('CONNECTOR_TELEGRAM_BOT_TOKEN'),
  chatId: env.get('CONNECTOR_TELEGRAM_CHAT_ID'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);
const visibleEffectsAllowed = !!env.get('LIVE_TEST_ALLOW_VISIBLE_EFFECTS');

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
    it('sends a real message to the configured chat', async () => {
      const client = new Telegram({ botToken: credentials.botToken! });

      const message = await client.sendMessage({
        chat_id: credentials.chatId!,
        text: `[tundra-connect live test — ${new Date().toISOString()}]`,
      });

      asserts.assertExists(message.message_id);
    });
  },
});
