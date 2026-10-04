import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { encodeBase64 } from '@encoding';
import {
  DEFAULT_USER_AGENT,
  MAX_BATCH_SIZE,
  Resend,
  type ResendOptions,
  type SendEmailOptions,
} from './Resend.ts';
import { ResendError } from './errors/mod.ts';

const AUTH = { type: 'BEARER' as const, token: 're_test_key' };

const validSend: SendEmailOptions = {
  from: 'Acme <onboarding@yourdomain.com>',
  to: 'recipient@example.com',
  subject: 'Welcome!',
  html: '<p>Thanks for signing up.</p>',
};

const EMAIL = {
  object: 'email',
  id: '4ef9a417-02e9-4d39-ad75-9611e0fcc33c',
  message_id: '<111-222-333@email.example.com>',
  to: ['delivered@resend.dev'],
  from: 'Acme <onboarding@resend.dev>',
  created_at: '2026-04-03 22:13:42.674981+00',
  subject: 'Hello World',
  html: 'Congrats on sending your <strong>first email</strong>!',
  text: null,
  bcc: [],
  cc: [],
  reply_to: [],
  last_event: 'delivered',
  scheduled_at: null,
  tags: [{ name: 'category', value: 'confirm_email' }],
};

class MockResend extends Resend {
  public request?: {
    url: string;
    method?: string;
    headers: Record<string, string>;
    body?: string;
  };

  setResponse(
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
  ): void {
    this._fetch = (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        // Normalized through `Headers` so assertions use lower-case names.
        headers: Object.fromEntries(new Headers(init?.headers)),
        body: init?.body as string | undefined,
      };
      return Promise.resolve(
        new Response(
          typeof body === 'string' ? body : JSON.stringify(body),
          {
            status,
            headers: { 'content-type': 'application/json', ...headers },
          },
        ),
      );
    };
  }
}

function client(options: Partial<ResendOptions> = {}): MockResend {
  const c = new MockResend({ auth: AUTH, ...options });
  c.setResponse({ id: 'email-1' });
  return c;
}

describe('Resend — configuration', () => {
  it('exposes the vendor name', () => {
    asserts.assertEquals(client().vendor, 'Resend');
  });

  it('rejects a missing API key', () => {
    const err = asserts.assertThrows(
      () => new MockResend({} as unknown as ResendOptions),
      ResendError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_API_KEY');
  });

  it('rejects a blank API key', () => {
    const err = asserts.assertThrows(
      () => new MockResend({ auth: { type: 'BEARER', token: '  ' } }),
      ResendError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_API_KEY');
  });

  it('rejects a non-BEARER auth type', () => {
    const err = asserts.assertThrows(
      () =>
        new MockResend({
          auth: { type: 'BASIC', username: 'u', password: 'p' },
        } as unknown as ResendOptions),
      ResendError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_API_KEY');
  });

  it('never exposes the API key through the client', () => {
    const c = client();
    asserts.assert(!JSON.stringify(c).includes('re_test_key'));
  });
});

describe('Resend — send', () => {
  it('POSTs to /emails with a Bearer key, JSON body and a User-Agent', async () => {
    const c = client();
    const ref = await c.send(validSend);
    asserts.assertEquals(ref.id, 'email-1');
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assertEquals(c.request!.url, 'https://api.resend.com/emails');
    asserts.assertEquals(
      c.request!.headers['authorization'],
      'Bearer re_test_key',
    );
    asserts.assertEquals(c.request!.headers['user-agent'], DEFAULT_USER_AGENT);
  });

  it('keeps a caller-configured User-Agent', async () => {
    const c = client({ headers: { 'user-agent': 'my-app/1.0' } });
    await c.send(validSend);
    asserts.assertEquals(c.request!.headers['user-agent'], 'my-app/1.0');
  });

  it('normalizes bare-string recipients to arrays on the wire', async () => {
    const c = client();
    await c.send({
      ...validSend,
      cc: 'cc@example.com',
      bcc: ['bcc@example.com'],
      reply_to: 'reply@example.com',
    });
    const body = JSON.parse(c.request!.body!);
    asserts.assertEquals(body.to, ['recipient@example.com']);
    asserts.assertEquals(body.cc, ['cc@example.com']);
    asserts.assertEquals(body.bcc, ['bcc@example.com']);
    asserts.assertEquals(body.reply_to, ['reply@example.com']);
  });

  it('carries tags, headers, attachments, schedule, topic and template', async () => {
    const c = client();
    await c.send({
      ...validSend,
      html: undefined,
      template: { id: 'welcome', variables: { name: 'Ada', count: 3 } },
      tags: [{ name: 'user_id', value: 'user_123' }],
      headers: { 'X-Entity-Ref-ID': 'abc' },
      attachments: [
        { content: 'SGVsbG8=', filename: 'hello.txt' },
        { path: 'https://example.com/invoice.pdf' },
      ],
      scheduled_at: 'in 1 hour',
      topic_id: 'topic-1',
    });
    const body = JSON.parse(c.request!.body!);
    asserts.assertEquals(body.template, {
      id: 'welcome',
      variables: { name: 'Ada', count: 3 },
    });
    asserts.assertEquals(body.tags, [{ name: 'user_id', value: 'user_123' }]);
    asserts.assertEquals(body.headers, { 'X-Entity-Ref-ID': 'abc' });
    asserts.assertEquals(body.attachments.length, 2);
    asserts.assertEquals(body.scheduled_at, 'in 1 hour');
    asserts.assertEquals(body.topic_id, 'topic-1');
  });

  it('sends an Idempotency-Key header when one is given', async () => {
    const c = client();
    await c.send(validSend, { idempotencyKey: 'welcome-user_123' });
    asserts.assertEquals(
      c.request!.headers['idempotency-key'],
      'welcome-user_123',
    );
  });

  it('omits Idempotency-Key when none is given', async () => {
    const c = client();
    await c.send(validSend);
    asserts.assertEquals(c.request!.headers['idempotency-key'], undefined);
  });
});

describe('Resend — local request validation', () => {
  const rejects = async (
    email: SendEmailOptions,
    options?: { idempotencyKey?: string },
  ) => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.send(email, options),
      ResendError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined); // nothing was sent
    return err;
  };

  it('requires one of html, text or template', async () => {
    const err = await rejects({ ...validSend, html: undefined });
    asserts.assertStringIncludes(err.message, 'template');
  });

  it('accepts text alone', async () => {
    const c = client();
    await c.send({ ...validSend, html: undefined, text: 'hi' });
    asserts.assertExists(c.request);
  });

  it('rejects a malformed sender', async () => {
    await rejects({ ...validSend, from: 'Acme' });
  });

  it('rejects an empty recipient list', async () => {
    await rejects({ ...validSend, to: [] });
  });

  it('rejects more than 50 `to` recipients', async () => {
    await rejects({
      ...validSend,
      to: Array.from({ length: 51 }, (_, i) => `r${i}@example.com`),
    });
  });

  it('rejects a tag outside Resend’s character set', async () => {
    await rejects({ ...validSend, tags: [{ name: 'user id', value: 'x' }] });
  });

  it('rejects a non-base64 attachment', async () => {
    await rejects({
      ...validSend,
      attachments: [{ content: 'not base64!!', filename: 'a.txt' }],
    });
  });

  it('rejects an attachment with neither content nor path', async () => {
    await rejects({ ...validSend, attachments: [{ filename: 'a.txt' }] });
  });

  it('rejects a boolean template variable instead of coercing it', async () => {
    await rejects({
      ...validSend,
      template: {
        id: 't',
        variables: { flag: true as unknown as string },
      },
    });
  });

  it('rejects an empty idempotency key', async () => {
    await rejects(validSend, { idempotencyKey: '' });
  });

  it('rejects an idempotency key over 256 characters', async () => {
    await rejects(validSend, { idempotencyKey: 'k'.repeat(257) });
  });
});

describe('Resend — sendBatch', () => {
  const second: SendEmailOptions = {
    from: 'a@yourdomain.com',
    to: ['x@example.com'],
    subject: 'Hi',
    text: 'Hi',
  };

  it('POSTs a JSON array to /emails/batch and returns ids in order', async () => {
    const c = client();
    c.setResponse({ data: [{ id: 'e1' }, { id: 'e2' }] });
    const result = await c.sendBatch([validSend, second], {
      idempotencyKey: 'batch-1',
    });
    asserts.assertEquals(result.data.map((r) => r.id), ['e1', 'e2']);
    asserts.assertEquals(
      c.request!.url,
      'https://api.resend.com/emails/batch',
    );
    const body = JSON.parse(c.request!.body!);
    asserts.assert(Array.isArray(body));
    asserts.assertEquals(body.length, 2);
    asserts.assertEquals(body[0].to, ['recipient@example.com']);
    asserts.assertEquals(c.request!.headers['idempotency-key'], 'batch-1');
  });

  it('rejects an empty batch', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.sendBatch([]),
      ResendError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
  });

  it(`rejects more than ${MAX_BATCH_SIZE} emails`, async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.sendBatch(Array(MAX_BATCH_SIZE + 1).fill(second)),
      ResendError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
  });

  it('rejects attachments in a batch and reports the index', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () =>
        c.sendBatch([second, {
          ...second,
          attachments: [{ content: 'SGVsbG8=', filename: 'a.txt' }],
        }]),
      ResendError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(err.getContextValue('index'), 1);
    asserts.assertEquals(c.request, undefined);
  });

  it('rejects scheduled_at in a batch', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.sendBatch([{ ...second, scheduled_at: 'in 1 hour' }]),
      ResendError,
    );
    asserts.assertEquals(err.getContextValue('index'), 0);
  });

  it('reports the index of an email that fails schema validation', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.sendBatch([second, second, { ...second, to: 'nope' }]),
      ResendError,
    );
    asserts.assertEquals(err.getContextValue('index'), 2);
    asserts.assertStringIncludes(err.message, 'emails[2]');
  });
});

describe('Resend — managing sent email', () => {
  it('getEmail GETs /emails/{id} and validates the record', async () => {
    const c = client();
    c.setResponse(EMAIL);
    const email = await c.getEmail(EMAIL.id);
    asserts.assertEquals(c.request!.method, 'GET');
    asserts.assertEquals(
      c.request!.url,
      `https://api.resend.com/emails/${EMAIL.id}`,
    );
    asserts.assertEquals(email.last_event, 'delivered');
    asserts.assertEquals(email.text, null);
    asserts.assertEquals(email.tags?.[0]?.value, 'confirm_email');
  });

  it('getEmail percent-encodes the id', async () => {
    const c = client();
    c.setResponse(EMAIL);
    await c.getEmail('a/../b');
    asserts.assertStringIncludes(c.request!.url, '/emails/a%2F..%2Fb');
  });

  it('rescheduleEmail PATCHes the new scheduled_at', async () => {
    const c = client();
    c.setResponse({ object: 'email', id: 'e1' });
    const ref = await c.rescheduleEmail('e1', '2026-12-24T09:00:00Z');
    asserts.assertEquals(ref, { object: 'email', id: 'e1' });
    asserts.assertEquals(c.request!.method, 'PATCH');
    asserts.assertEquals(JSON.parse(c.request!.body!), {
      scheduled_at: '2026-12-24T09:00:00Z',
    });
  });

  it('rescheduleEmail rejects a blank time', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.rescheduleEmail('e1', ' '),
      ResendError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
  });

  it('cancelEmail POSTs to /emails/{id}/cancel', async () => {
    const c = client();
    c.setResponse({ object: 'email', id: 'e1' });
    await c.cancelEmail('e1');
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assertEquals(
      c.request!.url,
      'https://api.resend.com/emails/e1/cancel',
    );
  });

  for (const method of ['getEmail', 'cancelEmail'] as const) {
    it(`${method} rejects a blank id without a request`, async () => {
      const c = client();
      const err = await asserts.assertRejects(
        () => c[method](''),
        ResendError,
      );
      asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
      asserts.assertEquals(c.request, undefined);
    });
  }
});

describe('Resend — error mapping', () => {
  const cases: [number, string, string][] = [
    [400, 'validation_error', 'INVALID_REQUEST'],
    [400, 'invalid_idempotency_key', 'INVALID_REQUEST'],
    [422, 'missing_required_field', 'INVALID_REQUEST'],
    [422, 'invalid_attachment', 'INVALID_REQUEST'],
    [401, 'missing_api_key', 'AUTH_FAILED'],
    [401, 'restricted_api_key', 'AUTH_FAILED'],
    [403, 'restricted_api_key', 'FORBIDDEN'],
    [403, 'invalid_permission', 'FORBIDDEN'],
    [403, 'suspended_api_key', 'FORBIDDEN'],
    [404, 'not_found', 'NOT_FOUND'],
    [409, 'concurrent_idempotent_requests', 'IDEMPOTENCY_CONFLICT'],
    [409, 'invalid_idempotent_request', 'IDEMPOTENCY_CONFLICT'],
    [409, 'resource_locked', 'CONFLICT'],
    [429, 'daily_quota_exceeded', 'QUOTA_EXCEEDED'],
    [429, 'monthly_quota_exceeded', 'QUOTA_EXCEEDED'],
    [429, 'rate_limit_exceeded', 'RATE_LIMITED'],
    [500, 'application_error', 'SERVICE_UNAVAILABLE'],
    [503, 'service_unavailable', 'SERVICE_UNAVAILABLE'],
  ];

  for (const [status, name, expected] of cases) {
    it(`maps ${status} ${name} to ${expected}`, async () => {
      const c = client();
      c.setResponse(
        { statusCode: status, name, message: `msg ${name}` },
        status,
      );
      const err = await asserts.assertRejects(
        () => c.send(validSend),
        ResendError,
      );
      asserts.assertEquals(err.code, expected);
      asserts.assertEquals(err.getContextValue('vendorName'), name);
      asserts.assertEquals(err.getContextValue('status'), status);
    });
  }

  it('falls back to HTTP status for an unknown vendor name', async () => {
    const c = client();
    c.setResponse({ statusCode: 404, name: 'brand_new', message: 'x' }, 404);
    const err = await asserts.assertRejects(
      () => c.getEmail('e1'),
      ResendError,
    );
    asserts.assertEquals(err.code, 'NOT_FOUND');
  });

  it('falls back to HTTP status when the body is not Resend’s', async () => {
    const c = client();
    c.setResponse('<html>502 Bad Gateway</html>', 502, {
      'content-type': 'text/html',
    });
    const err = await asserts.assertRejects(
      () => c.send(validSend),
      ResendError,
    );
    asserts.assertEquals(err.code, 'SERVICE_UNAVAILABLE');
  });

  it('attaches a retry-after hint to a 429', async () => {
    const c = client();
    c.setResponse(
      { statusCode: 429, name: 'rate_limit_exceeded', message: 'slow down' },
      429,
      { 'retry-after': '2' },
    );
    const err = await asserts.assertRejects(
      () => c.send(validSend),
      ResendError,
    );
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 2);
  });

  it('raises RESPONSE_ERROR when a success body fails validation', async () => {
    const c = client();
    c.setResponse({ nope: true });
    const err = await asserts.assertRejects(
      () => c.send(validSend),
      ResendError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });

  it('never leaks the API key into a mapped vendor error', async () => {
    const c = client();
    c.setResponse(
      { statusCode: 401, name: 'missing_api_key', message: 'no key' },
      401,
    );
    const err = await asserts.assertRejects(
      () => c.send(validSend),
      ResendError,
    );
    asserts.assert(!JSON.stringify(err.toJSON()).includes('re_test_key'));
  });
});

describe('Resend — transport failures', () => {
  it('throws a transient TIMEOUT when no answer arrives within the timeout', async () => {
    const c = client({ timeout: 1 });
    c['_fetch'] = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason));
      });
    const err = await asserts.assertRejects(
      () => c.getEmail('e1'),
      ResendError,
    );
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1);
  });

  it('throws a transient NETWORK_ERROR when fetch itself fails', async () => {
    const c = client();
    c['_fetch'] = () => Promise.reject(new TypeError('error sending request'));
    const err = await asserts.assertRejects(
      () => c.send(validSend),
      ResendError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(
      JSON.stringify(err.toJSON()).includes(AUTH.token),
      false,
    );
  });

  it('flags a 5xx as transient and a refusal as not', async () => {
    const c = client();
    c.setResponse('<html>503</html>', 503, { 'content-type': 'text/html' });
    const outage = await asserts.assertRejects(
      () => c.send(validSend),
      ResendError,
    );
    asserts.assertEquals(outage.code, 'SERVICE_UNAVAILABLE');
    asserts.assertEquals(outage.transient, true);

    c.setResponse(
      { statusCode: 401, name: 'missing_api_key', message: 'no key' },
      401,
    );
    const refusal = await asserts.assertRejects(
      () => c.send(validSend),
      ResendError,
    );
    asserts.assertEquals(refusal.code, 'AUTH_FAILED');
    asserts.assertEquals(refusal.transient, false);
  });
});

describe('Resend — maxRetryWait (RESTler rate-limit retry)', () => {
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockResend({ auth: AUTH, maxRetryWait });
    const slept: number[] = [];
    let calls = 0;
    c['_sleep'] = (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    };
    c['_fetch'] = () => {
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
      () => c.send(validSend),
      ResendError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 1);
    asserts.assertEquals(slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws RATE_LIMITED immediately with retried: false when the hint exceeds maxRetryWait', async () => {
    const { c, slept, calls } = throttled(5, '120');
    const err = await asserts.assertRejects(
      () => c.send(validSend),
      ResendError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

describe('Resend — verifyWebhook', () => {
  const secretBytes = new TextEncoder().encode(
    'resend-test-signing-secret-bytes',
  );
  const SECRET = `whsec_${encodeBase64(secretBytes)}`;
  const NOW_MS = 1_700_000_000_000;
  const TS = String(NOW_MS / 1000);
  const PAYLOAD = JSON.stringify({
    type: 'email.delivered',
    created_at: '2023-11-14T22:13:20.000Z',
    data: { email_id: 'e1', to: ['delivered@resend.dev'] },
  });

  async function sign(id: string, ts: string, body: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const mac = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(Resend.webhookSignedContent(id, ts, body)),
    );
    return `v1,${encodeBase64(new Uint8Array(mac))}`;
  }

  const verify = async (
    overrides: Partial<Parameters<Resend['verifyWebhook']>[0]> = {},
    headerOverrides: Record<string, string | undefined> = {},
  ) => {
    const headers: Record<string, string | undefined> = {
      'svix-id': 'msg_1',
      'svix-timestamp': TS,
      'svix-signature': await sign('msg_1', TS, PAYLOAD),
      ...headerOverrides,
    };
    return client().verifyWebhook({
      payload: PAYLOAD,
      headers,
      secret: SECRET,
      nowMs: NOW_MS,
      ...overrides,
    });
  };

  it('accepts a correctly signed payload and returns the parsed event', async () => {
    const event = await verify();
    asserts.assertEquals(event.type, 'email.delivered');
    asserts.assertEquals(event.data.email_id, 'e1');
  });

  it('accepts a Headers instance with mixed-case names', async () => {
    const headers = new Headers({
      'Svix-Id': 'msg_1',
      'Svix-Timestamp': TS,
      'Svix-Signature': await sign('msg_1', TS, PAYLOAD),
    });
    const event = await client().verifyWebhook({
      payload: PAYLOAD,
      headers,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    asserts.assertEquals(event.type, 'email.delivered');
  });

  it('accepts the Standard Webhooks header aliases', async () => {
    const event = await client().verifyWebhook({
      payload: PAYLOAD,
      headers: {
        'webhook-id': 'msg_1',
        'webhook-timestamp': TS,
        'webhook-signature': await sign('msg_1', TS, PAYLOAD),
      },
      secret: SECRET,
      nowMs: NOW_MS,
    });
    asserts.assertEquals(event.type, 'email.delivered');
  });

  it('accepts a match anywhere in a rotated, multi-signature header', async () => {
    const good = await sign('msg_1', TS, PAYLOAD);
    const event = await verify({}, {
      'svix-signature': `v1,AAAA v2,BBBB ${good}`,
    });
    asserts.assertEquals(event.type, 'email.delivered');
  });

  it('accepts a secret without the whsec_ prefix', async () => {
    const event = await verify({ secret: SECRET.slice(6) });
    asserts.assertEquals(event.type, 'email.delivered');
  });

  it('rejects a tampered payload', async () => {
    const err = await asserts.assertRejects(
      () => verify({ payload: PAYLOAD.replace('e1', 'e2') }),
      ResendError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });

  it('rejects a signature made with another secret', async () => {
    const err = await asserts.assertRejects(
      () => verify({ secret: `whsec_${encodeBase64(new Uint8Array(32))}` }),
      ResendError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });

  it('rejects missing headers and names them', async () => {
    const err = await asserts.assertRejects(
      () => verify({}, { 'svix-id': undefined, 'svix-signature': undefined }),
      ResendError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_INVALID_HEADERS');
    asserts.assertStringIncludes(err.message, 'svix-id');
    asserts.assertStringIncludes(err.message, 'svix-signature');
  });

  it('rejects a stale timestamp', async () => {
    const err = await asserts.assertRejects(
      () => verify({ nowMs: NOW_MS + 301_000 }),
      ResendError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_TIMESTAMP_INVALID');
  });

  it('rejects a far-future timestamp', async () => {
    const err = await asserts.assertRejects(
      () => verify({ nowMs: NOW_MS - 301_000 }),
      ResendError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_TIMESTAMP_INVALID');
  });

  it('rejects a non-numeric timestamp', async () => {
    const err = await asserts.assertRejects(
      () => verify({}, { 'svix-timestamp': '1e9' }),
      ResendError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_TIMESTAMP_INVALID');
  });

  it('rejects a secret that is not base64', async () => {
    const err = await asserts.assertRejects(
      () => verify({ secret: 'whsec_not base64!!' }),
      ResendError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_INVALID_SECRET');
  });

  it('rejects a correctly signed body that is not a Resend event', async () => {
    const body = JSON.stringify({ hello: 'world' });
    const err = await asserts.assertRejects(
      async () =>
        await verify({ payload: body }, {
          'svix-signature': await sign('msg_1', TS, body),
        }),
      ResendError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_INVALID_PAYLOAD');
  });

  it('rejects a correctly signed body that is not JSON', async () => {
    const body = 'not json';
    const err = await asserts.assertRejects(
      async () =>
        await verify({ payload: body }, {
          'svix-signature': await sign('msg_1', TS, body),
        }),
      ResendError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_INVALID_PAYLOAD');
  });
});

const env = envArgs();
const credentials = { apiKey: env.get('CONNECTOR_RESEND_API_KEY') };
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'Resend — live',
  // Safe on the monthly schedule: every send goes from Resend's shared
  // onboarding@resend.dev sender to its delivered@resend.dev test inbox,
  // which no real person reads — so no LIVE_TEST_ALLOW_VISIBLE_EFFECTS gate.
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    const live = () =>
      new Resend({ auth: { type: 'BEARER', token: credentials.apiKey! } });

    it('sends a test email and reads it back', async () => {
      const c = live();
      const { id } = await c.send({
        from: 'Tundra Connect <onboarding@resend.dev>',
        to: 'delivered@resend.dev',
        subject: 'tundra-connect live test',
        text: 'Live test from @tundraconnect/resend.',
        tags: [{ name: 'suite', value: 'tundra_connect_live' }],
      });
      const email = await c.getEmail(id);
      asserts.assertEquals(email.id, id);
      asserts.assertEquals(email.to, ['delivered@resend.dev']);
    });

    it('schedules an email and cancels it before it sends', async () => {
      const c = live();
      const { id } = await c.send({
        from: 'Tundra Connect <onboarding@resend.dev>',
        to: 'delivered@resend.dev',
        subject: 'tundra-connect live test (scheduled)',
        text: 'This scheduled email is cancelled by the live test.',
        scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      const cancelled = await c.cancelEmail(id);
      asserts.assertEquals(cancelled.id, id);
    });
  },
});
