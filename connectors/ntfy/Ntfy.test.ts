import * as asserts from '@asserts';
import { describe, it } from '@test';
import { GuardianError } from '@guardian';
import { envArgs } from '@utils';
import { Ntfy } from './Ntfy.ts';
import { NtfyError } from './errors/mod.ts';

class MockNtfy extends Ntfy {
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

const publishedMessage = {
  id: 'sPs71M8A2T',
  time: 1643935928,
  event: 'message',
  topic: 'mytopic',
  message: 'Hello from ntfy!',
};

describe('Ntfy', () => {
  it('constructs with no arguments at all, defaulting to the public instance', () => {
    const client = new MockNtfy();
    asserts.assertEquals(client.vendor, 'ntfy');
  });

  it('publishes a message with no auth configured', async () => {
    const client = new MockNtfy();
    client.setResponse(JSON.stringify(publishedMessage));

    const result = await client.publish({
      topic: 'mytopic',
      message: 'Hello from ntfy!',
    });

    asserts.assertEquals(result.id, 'sPs71M8A2T');
    asserts.assertEquals(client.request?.method, 'POST');
    asserts.assertEquals(client.request?.url, 'https://ntfy.sh/');
    const headers = client.request?.headers as Record<string, string>;
    asserts.assertEquals(headers['Authorization'], undefined);
  });

  it('supports a self-hosted baseURL override', async () => {
    const client = new MockNtfy({ baseURL: 'https://ntfy.example.com' });
    client.setResponse(JSON.stringify(publishedMessage));

    await client.publish({ topic: 'mytopic', message: 'hi' });

    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'https://ntfy.example.com',
    );
  });

  it('sends configured BASIC auth as an Authorization header', async () => {
    const client = new MockNtfy({
      auth: { type: 'BASIC', username: 'phil', password: 'mypass' },
    });
    client.setResponse(JSON.stringify(publishedMessage));

    await client.publish({ topic: 'mytopic', message: 'hi' });

    const headers = client.request?.headers as Record<string, string>;
    asserts.assertStringIncludes(headers['Authorization'] ?? '', 'Basic ');
  });

  it('sends a configured access token as a Bearer token', async () => {
    const client = new MockNtfy({
      auth: { type: 'BEARER', token: 'tk_AbCdEfGhIjKlMnOpQrStUvWxYz012345' },
    });
    client.setResponse(JSON.stringify(publishedMessage));

    await client.publish({ topic: 'mytopic', message: 'hi' });

    const headers = client.request?.headers as Record<string, string>;
    asserts.assertEquals(
      headers['Authorization'],
      'BEARER tk_AbCdEfGhIjKlMnOpQrStUvWxYz012345',
    );
  });

  it('publishes the full JSON body, including nested actions', async () => {
    const client = new MockNtfy();
    client.setResponse(JSON.stringify(publishedMessage));

    await client.publish({
      topic: 'mytopic',
      message: 'Disk usage on server1 is at 90%',
      title: 'Disk space alert',
      priority: 4,
      tags: ['warning', 'floppy_disk'],
      click: 'https://example.com',
      attach: 'https://example.com/report.pdf',
      filename: 'server1-report.pdf',
      icon: 'https://example.com/icon.png',
      markdown: true,
      email: 'oncall@example.com',
      actions: [
        { action: 'view', label: 'Open dashboard', url: 'https://example.com' },
      ],
    });

    const sentBody = JSON.parse(String(client.request?.body));
    asserts.assertEquals(sentBody.topic, 'mytopic');
    asserts.assertEquals(sentBody.priority, 4);
    asserts.assertEquals(sentBody.tags, ['warning', 'floppy_disk']);
    asserts.assertEquals(sentBody.actions[0].action, 'view');
    asserts.assertEquals(sentBody.filename, 'server1-report.pdf');
    asserts.assertEquals(sentBody.icon, 'https://example.com/icon.png');
    asserts.assertEquals(sentBody.email, 'oncall@example.com');
  });

  it('returns the full parsed response envelope', async () => {
    const client = new MockNtfy();
    client.setResponse(
      JSON.stringify({
        ...publishedMessage,
        priority: 5,
        tags: ['warning', 'skull'],
        attachment: {
          name: 'camera.jpg',
          url: 'https://ntfy.sh/file/sPs71M8A2T.jpg',
        },
      }),
    );

    const result = await client.publish({ topic: 'mytopic' });
    asserts.assertEquals(result.priority, 5);
    asserts.assertEquals(result.attachment?.name, 'camera.jpg');
  });

  it('rejects a locally invalid publish request before making a request', async () => {
    const client = new MockNtfy();
    // Stub the network so an unexpected real call would fail fast instead
    // of hanging, then confirm below that it was never actually reached.
    client.setResponse(JSON.stringify(publishedMessage));

    const error = await asserts.assertRejects(
      () =>
        client.publish({
          topic: 'not a valid topic!',
          message: 'hi',
        }),
      NtfyError,
    );
    asserts.assertInstanceOf(error.cause, GuardianError);
    asserts.assertEquals(client.request, undefined);
  });

  it('raises RESPONSE_ERROR when a 200 body fails validation', async () => {
    const client = new MockNtfy();
    client.setResponse(JSON.stringify({ topic: 'mytopic' })); // missing id/time/event

    await asserts.assertRejects(
      () => client.publish({ topic: 'mytopic' }),
      NtfyError,
      'response',
    );
  });

  it('maps every documented vendor error status to its connect-specific code', async () => {
    const cases: Array<{ status: number; expectedSubstring: string }> = [
      { status: 400, expectedSubstring: 'invalid' },
      { status: 401, expectedSubstring: 'unauthenticated' },
      { status: 403, expectedSubstring: 'not permitted' },
      { status: 404, expectedSubstring: 'not found' },
      { status: 413, expectedSubstring: 'limit' },
      { status: 429, expectedSubstring: 'rate limit' },
    ];

    for (const { status, expectedSubstring } of cases) {
      const client = new MockNtfy();
      client.setResponse(
        JSON.stringify({ code: 40000 + status, http: status, error: 'nope' }),
        status,
      );

      await asserts.assertRejects(
        () => client.publish({ topic: 'mytopic' }),
        NtfyError,
        expectedSubstring,
      );
    }
  });

  it('carries the vendor error envelope on the thrown error', async () => {
    const client = new MockNtfy();
    client.setResponse(
      JSON.stringify({
        code: 40101,
        http: 401,
        error: 'unauthorized',
        link: 'https://ntfy.sh/docs/publish/',
      }),
      401,
    );

    try {
      await client.publish({ topic: 'mytopic' });
      throw new Error('expected publish to reject');
    } catch (error) {
      asserts.assert(error instanceof NtfyError);
      asserts.assertEquals(error.getContextValue('vendorCode'), 40101);
      asserts.assertEquals(
        error.getContextValue('link'),
        'https://ntfy.sh/docs/publish/',
      );
    }
  });

  it('falls back to SERVICE_UNAVAILABLE for an unparseable 5xx response', async () => {
    const client = new MockNtfy();
    client.setResponse('<html>Bad Gateway</html>', 502, {
      'content-type': 'text/html',
    });

    await asserts.assertRejects(
      () => client.publish({ topic: 'mytopic' }),
      NtfyError,
      'unavailable',
    );
  });

  it('falls back to UNKNOWN_ERROR for an unmapped status without a documented envelope', async () => {
    const client = new MockNtfy();
    client.setResponse('teapot', 418, {});

    await asserts.assertRejects(
      () => client.publish({ topic: 'mytopic' }),
      NtfyError,
      'unknown error',
    );
  });
});

// ---------------------------------------------------------------------------
// Live test — publishes a real message to a real ntfy topic. ntfy.sh topics
// are effectively public/guessable (no account needed to subscribe), and
// `publish` — the only method this connect has — is this connect's sole
// operation, with no way to delete a published message afterward. Skipped
// entirely unless CONNECTOR_NTFY_TEST_TOPIC is set (via env or a `.env`
// file — see `envArgs`) AND LIVE_TEST_ALLOW_VISIBLE_EFFECTS is set.
// ---------------------------------------------------------------------------
/** Everything an error could surface to a log: its message plus its serialized context. */
function dumpError(err: unknown): string {
  const e = err as { message?: string; toJSON?: () => unknown };
  return `${e.message ?? ''} ${JSON.stringify(e.toJSON?.() ?? String(err))}`;
}

describe('ntfy — credential custody', () => {
  it('never leaks the Basic password from a runtime failure', async () => {
    const client = new MockNtfy({
      auth: { type: 'BASIC', username: 'phil', password: 'pw-SECRETMARKER' },
    });
    client.setResponse(JSON.stringify({ error: 'boom' }), 500);
    const err = await asserts.assertRejects(
      () => client.publish({ topic: 'mytopic', message: 'hi' }),
      NtfyError,
    );
    asserts.assert(!dumpError(err).includes('SECRETMARKER'));
  });
});

const env = envArgs();
const credentials = {
  testTopic: env.get('CONNECTOR_NTFY_TEST_TOPIC'),
};
const liveTestsEnabled = !!credentials.testTopic;
const visibleEffectsAllowed = !!env.get('LIVE_TEST_ALLOW_VISIBLE_EFFECTS');

// Sends a real, visible message — gated behind LIVE_TEST_ALLOW_VISIBLE_EFFECTS
// so it never fires on the unattended monthly schedule.
describe({
  name: 'Ntfy — live',
  ignore: !liveTestsEnabled || !visibleEffectsAllowed,
  bun: false,
  node: false,
  fn: () => {
    it('publishes a real message to the configured test topic', async () => {
      const client = new Ntfy();

      const result = await client.publish({
        topic: credentials.testTopic!,
        message: `[tundra-connect live test — ${new Date().toISOString()}]`,
      });

      asserts.assertExists(result.id);
    });
  },
});
