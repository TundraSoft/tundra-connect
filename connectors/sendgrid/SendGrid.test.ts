import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { GuardianError } from '@guardian';
import { SendGrid } from './SendGrid.ts';
import { SendGridError } from './errors/mod.ts';

const validMailRequest = {
  personalizations: [{ to: [{ email: 'dest@example.com' }] }],
  from: { email: 'sender@example.com' },
  subject: 'Hello',
  content: [{ type: 'text/plain', value: 'Hi there!' }],
};

class MockSendGrid extends SendGrid {
  public request?: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
  };
  private responseBody: BodyInit | null = null;
  private responseStatus = 202;
  private responseHeaders: Record<string, string> = {};

  setResponse(
    body: BodyInit | null,
    status = 202,
    headers: Record<string, string> = {},
  ): void {
    this.responseBody = body;
    this.responseStatus = status;
    this.responseHeaders = headers;
    this._fetch = (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
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

describe('SendGrid', () => {
  it('exposes validated configuration through named getters', () => {
    const client = new MockSendGrid({
      auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' },
    });
    asserts.assertEquals(client.vendor, 'SendGrid');
    asserts.assertEquals(client.apiKey, 'SG.test-key');
  });

  it('rejects a blank API key', () => {
    asserts.assertThrows(
      () =>
        new MockSendGrid({
          auth: { type: 'BEARER', token: '', prefix: 'Bearer' },
        }),
      SendGridError,
      'API key must be a non-empty string',
    );
    asserts.assertThrows(
      () =>
        new MockSendGrid({
          auth: { type: 'BEARER', token: '   ', prefix: 'Bearer' },
        }),
      SendGridError,
      'API key must be a non-empty string',
    );
  });

  it('rejects a completely missing API key', () => {
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => new MockSendGrid({} as any),
      SendGridError,
      'API key must be a non-empty string',
    );
  });

  it('rejects an auth config that is not a Bearer token', () => {
    asserts.assertThrows(
      () =>
        // deno-lint-ignore no-explicit-any
        new MockSendGrid({
          auth: { type: 'BASIC', username: 'x', password: 'y' },
        } as any),
      SendGridError,
      'API key must be a non-empty string',
    );
  });

  it('never leaks the configured auth value into a thrown config error', () => {
    const secretLookingToken = 'SG.super-secret-value-that-must-not-leak';
    let caught: SendGridError | undefined;
    try {
      // `type: 'BASIC'` is not a shape SendGrid supports — fails
      // validation just like a blank/missing token would — while still
      // carrying a secret-looking value in `password`, to prove it never
      // surfaces on the thrown error.
      new MockSendGrid({
        auth: { type: 'BASIC', username: 'x', password: secretLookingToken },
        // deno-lint-ignore no-explicit-any
      } as any);
    } catch (err) {
      caught = err as SendGridError;
    }
    asserts.assertExists(caught);
    asserts.assertEquals(caught?.message.includes(secretLookingToken), false);
    asserts.assertEquals(
      JSON.stringify(caught?.toJSON()).includes(secretLookingToken),
      false,
    );
  });

  it('sends the configured API key as a Bearer token', async () => {
    const client = new MockSendGrid({
      auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' },
    });
    client.setResponse(null, 202, { 'x-message-id': 'msg-1' });

    await client.sendMail(validMailRequest);

    const headers = client.request?.headers as Record<string, string>;
    asserts.assertEquals(headers['Authorization'], 'Bearer SG.test-key');
    asserts.assertEquals(client.request?.method, 'POST');
    asserts.assertStringIncludes(client.request?.url ?? '', '/mail/send');
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      'https://api.sendgrid.com/v3',
    );
  });

  it('treats 202 Accepted as success and returns the message id when present', async () => {
    const client = new MockSendGrid({
      auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' },
    });
    client.setResponse(null, 202, { 'x-message-id': 'msg-202' });

    const result = await client.sendMail(validMailRequest);
    asserts.assertEquals(result.messageId, 'msg-202');
  });

  it('treats sandbox-mode 200 OK as success too, not just 202', async () => {
    const client = new MockSendGrid({
      auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' },
    });
    client.setResponse(null, 200, { 'x-message-id': 'msg-sandbox' });

    const result = await client.sendMail({
      ...validMailRequest,
      mail_settings: { sandbox_mode: { enable: true } },
    });
    asserts.assertEquals(result.messageId, 'msg-sandbox');
  });

  it('omits messageId when the X-Message-Id header is absent, rather than assuming it', async () => {
    const client = new MockSendGrid({
      auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' },
    });
    client.setResponse(null, 202);

    const result = await client.sendMail(validMailRequest);
    asserts.assertEquals(result, {});
    asserts.assertEquals(result.messageId, undefined);
  });

  it('rejects a locally invalid mail-send request before making a request', async () => {
    const client = new MockSendGrid({
      auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' },
    });
    // Stub the network so an unexpected real call would fail fast instead
    // of hanging, then confirm below that it was never actually reached.
    client.setResponse(null, 202);

    const error = await asserts.assertRejects(
      () =>
        client.sendMail({
          personalizations: [],
          from: { email: 'sender@example.com' },
          content: [{ type: 'text/plain', value: 'hi' }],
          // deno-lint-ignore no-explicit-any
        } as any),
      SendGridError,
    );
    asserts.assertInstanceOf(error.cause, GuardianError);
    asserts.assertEquals(client.request, undefined);
  });

  it('lists API key scopes', async () => {
    const client = new MockSendGrid({
      auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' },
    });
    client.setResponse(
      JSON.stringify({ scopes: ['mail.send', 'alerts.read'] }),
      200,
      { 'content-type': 'application/json' },
    );

    const result = await client.getScopes();
    asserts.assertEquals(result.scopes, ['mail.send', 'alerts.read']);
    asserts.assertEquals(client.request?.method, 'GET');
    asserts.assertStringIncludes(client.request?.url ?? '', '/scopes');
  });

  it('raises RESPONSE_ERROR when a 200 scopes body fails validation', async () => {
    const client = new MockSendGrid({
      auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' },
    });
    client.setResponse(
      JSON.stringify({ scopes: 'not-an-array' }),
      200,
      { 'content-type': 'application/json' },
    );

    await asserts.assertRejects(
      () => client.getScopes(),
      SendGridError,
      'response',
    );
  });

  it('maps every documented vendor error status to its connect-specific code', async () => {
    const cases: Array<{ status: number; expectedSubstring: string }> = [
      { status: 400, expectedSubstring: 'invalid' },
      { status: 401, expectedSubstring: 'unauthenticated' },
      { status: 403, expectedSubstring: 'not permitted' },
      { status: 404, expectedSubstring: 'not found' },
      { status: 405, expectedSubstring: 'not allowed' },
      { status: 413, expectedSubstring: 'size limit' },
      { status: 429, expectedSubstring: 'rate limit' },
    ];

    for (const { status, expectedSubstring } of cases) {
      const client = new MockSendGrid({
        auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' },
      });
      client.setResponse(
        JSON.stringify({
          errors: [{ message: 'Vendor error.', field: null }],
        }),
        status,
        { 'content-type': 'application/json' },
      );

      await asserts.assertRejects(
        () => client.sendMail(validMailRequest),
        SendGridError,
        expectedSubstring,
      );
    }
  });

  it('carries the raw vendor errors array on the thrown error', async () => {
    const client = new MockSendGrid({
      auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' },
    });
    client.setResponse(
      JSON.stringify({
        errors: [
          {
            message: 'The from email does not contain a valid address.',
            field: 'from.email',
          },
        ],
        id: 'req-1',
      }),
      400,
      { 'content-type': 'application/json' },
    );

    try {
      await client.sendMail(validMailRequest);
      throw new Error('expected sendMail to reject');
    } catch (error) {
      asserts.assert(error instanceof SendGridError);
      asserts.assertEquals(error.getContextValue('id'), 'req-1');
      const errors = error.getContextValue('errors') as Array<
        { message: string; field: string | null }
      >;
      asserts.assertEquals(errors[0]?.field, 'from.email');
    }
  });

  it('falls back to SERVICE_UNAVAILABLE for an unparseable 5xx response', async () => {
    const client = new MockSendGrid({
      auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' },
    });
    client.setResponse('<html>Internal Server Error</html>', 500, {
      'content-type': 'text/html',
    });

    await asserts.assertRejects(
      () => client.sendMail(validMailRequest),
      SendGridError,
      'unavailable',
    );
  });

  it('falls back to UNKNOWN_ERROR for an unmapped status without a documented envelope', async () => {
    const client = new MockSendGrid({
      auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' },
    });
    client.setResponse('teapot', 418);

    await asserts.assertRejects(
      () => client.sendMail(validMailRequest),
      SendGridError,
      'unknown error',
    );
  });
});

// ---------------------------------------------------------------------------
// Live test — exercises the real SendGrid v3 API. Skipped entirely unless
// CONNECTOR_SENDGRID_API_KEY is set (via env or a `.env` file — see
// `envArgs`), which is never the case in CI/sandboxed environments, so this
// never runs unattended.
//
// `sendMail` is exercised with `mail_settings.sandbox_mode.enable: true`
// (confirmed field path/casing — snake_case, per SendGrid.ts's own
// `sendMail` doc and the mock coverage above) — SendGrid validates the full
// request against this exact field, but never actually delivers it, so
// this round-trips real auth/schema/request handling without sending mail
// to anyone. Nothing is created or left behind, so there's nothing to
// clean up.
// ---------------------------------------------------------------------------

/** DER-encodes a raw 64-byte R‖S ECDSA signature — what SendGrid puts in the header. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    const v = b.slice(i);
    const pad = (v[0]! & 0x80) ? [0] : [];
    return [0x02, v.length + pad.length, ...pad, ...v];
  };
  const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
  return new Uint8Array([0x30, body.length, ...body]);
}
function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
async function p256() {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const spki = b64(
    new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey)),
  );
  const sign = async (msg: string) =>
    b64(
      rawToDer(
        new Uint8Array(
          await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            kp.privateKey,
            new TextEncoder().encode(msg) as unknown as BufferSource,
          ),
        ),
      ),
    );
  return { spki, sign };
}
describe('SendGrid — verifyWebhook', () => {
  const NOW_MS = 1_700_000_000_000;
  const TS = String(Math.floor(NOW_MS / 1000));
  const PAYLOAD = JSON.stringify([{
    event: 'delivered',
    email: 'a@example.com',
  }]);
  const client = () =>
    new MockSendGrid({
      auth: { type: 'BEARER', token: 'SG.test', prefix: 'Bearer' },
    });
  const hdrs = (sig: string, ts = TS) => ({
    'x-twilio-email-event-webhook-signature': sig,
    'x-twilio-email-event-webhook-timestamp': ts,
  });

  it('accepts a genuine ECDSA P-256 signature over timestamp+payload (base64 SPKI key)', async () => {
    const k = await p256();
    const events = await client().verifyWebhook({
      payload: PAYLOAD,
      headers: hdrs(await k.sign(TS + PAYLOAD)),
      publicKey: k.spki,
      nowMs: NOW_MS,
    }) as { event: string }[];
    asserts.assertEquals(events[0]!.event, 'delivered');
  });
  it('accepts the key in PEM armour too', async () => {
    const k = await p256();
    const pem =
      `-----BEGIN PUBLIC KEY-----\n${k.spki}\n-----END PUBLIC KEY-----`;
    await client().verifyWebhook({
      payload: PAYLOAD,
      headers: hdrs(await k.sign(TS + PAYLOAD)),
      publicKey: pem,
      nowMs: NOW_MS,
    });
  });
  it('rejects a tampered payload and a signature from a different key', async () => {
    const k = await p256();
    const other = await p256();
    const e1 = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD + ' ',
          headers: hdrs(await k.sign(TS + PAYLOAD)),
          publicKey: k.spki,
          nowMs: NOW_MS,
        }),
      SendGridError,
    );
    asserts.assertEquals(e1.code, 'WEBHOOK_SIGNATURE_INVALID');
    const e2 = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD,
          headers: hdrs(await other.sign(TS + PAYLOAD)),
          publicKey: k.spki,
          nowMs: NOW_MS,
        }),
      SendGridError,
    );
    asserts.assertEquals(e2.code, 'WEBHOOK_SIGNATURE_INVALID');
  });
  it('rejects a replay outside the window and a garbage key', async () => {
    const k = await p256();
    const e1 = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD,
          headers: hdrs(await k.sign(TS + PAYLOAD)),
          publicKey: k.spki,
          nowMs: NOW_MS + 301_000,
        }),
      SendGridError,
    );
    asserts.assertEquals(e1.code, 'WEBHOOK_TIMESTAMP_INVALID');
    const e2 = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD,
          headers: hdrs(await k.sign(TS + PAYLOAD)),
          publicKey: 'bm90LWEta2V5',
          nowMs: NOW_MS,
        }),
      SendGridError,
    );
    asserts.assertEquals(e2.code, 'WEBHOOK_INVALID_KEY');
  });
  it('rejects missing headers', async () => {
    const err = await asserts.assertRejects(
      () =>
        client().verifyWebhook({
          payload: PAYLOAD,
          headers: {},
          publicKey: 'x',
          nowMs: NOW_MS,
        }),
      SendGridError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_INVALID_HEADERS');
  });
  it('rejects a non-numeric timestamp as WEBHOOK_TIMESTAMP_INVALID', async () => {
    const k = await p256();
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD,
          headers: hdrs(await k.sign(TS + PAYLOAD), 'not-a-number'),
          publicKey: k.spki,
          nowMs: NOW_MS,
        }),
      SendGridError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_TIMESTAMP_INVALID');
  });
  it('rejects a signature that is not a DER-encoded ECDSA value as WEBHOOK_SIGNATURE_INVALID', async () => {
    const k = await p256();
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD,
          headers: hdrs('AAAA'), // valid base64, three zero bytes — not DER
          publicKey: k.spki,
          nowMs: NOW_MS,
        }),
      SendGridError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });
});

const env = envArgs();
const credentials = {
  apiKey: env.get('CONNECTOR_SENDGRID_API_KEY'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe('SendGrid — maxRetryWait (RESTler rate-limit retry)', () => {
  /**
   * A client whose every request is answered 429 with a `retry-after` hint,
   * and whose waits are recorded instead of slept. `maxRetryWait` is what
   * routes a 429 to RESTler's retry logic (and so to this connect's
   * `RESTlerRateLimitError` rewrap) — without it the vendor handler maps the
   * 429 directly, which the error-mapping tests already cover.
   */
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockSendGrid({
      auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' },
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
      () => c.sendMail(validMailRequest),
      SendGridError,
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
      () => c.sendMail(validMailRequest),
      SendGridError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

describe({
  name: 'SendGrid — live',
  // Deno only: Bun/Node each get their own connect-wide live-test job
  // (see the repo's CI matrix), so this suite only registers on Deno — it
  // must not double-run the same live assertions three times.
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('validates a real sandbox-mode send against the SendGrid API (delivers nothing)', async () => {
      const client = new SendGrid({
        auth: {
          type: 'BEARER',
          token: credentials.apiKey!,
          prefix: 'Bearer',
        },
      });

      const result = await client.sendMail({
        personalizations: [{ to: [{ email: 'dest@example.com' }] }],
        from: { email: 'sender@example.com' },
        subject: 'tundra-connect live test',
        content: [{ type: 'text/plain', value: 'sandbox-mode live test' }],
        mail_settings: { sandbox_mode: { enable: true } },
      });

      // Sandbox mode never actually sends, so whether SendGrid attaches an
      // X-Message-Id header for it is not a documented guarantee — only
      // assert on its type when present, not its presence.
      if (result.messageId !== undefined) {
        asserts.assertEquals(typeof result.messageId, 'string');
      }
    });

    it('lists the configured API key scopes against the live SendGrid API', async () => {
      const client = new SendGrid({
        auth: {
          type: 'BEARER',
          token: credentials.apiKey!,
          prefix: 'Bearer',
        },
      });

      const result = await client.getScopes();
      asserts.assertEquals(Array.isArray(result.scopes), true);
    });
  },
});
