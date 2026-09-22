import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { CloudflareEmail, type SendEmailOptions } from './CloudflareEmail.ts';
import { CloudflareEmailError } from './errors/mod.ts';

const ACCOUNT = 'acct-123';
const AUTH = { type: 'BEARER' as const, token: 'cf-token', prefix: 'Bearer' };

const validSend: SendEmailOptions = {
  from: 'welcome@yourdomain.com',
  to: 'recipient@example.com',
  subject: 'Welcome!',
  text: 'Thanks for signing up.',
};

/** Envelope Cloudflare wraps every client/v4 response in. */
function envelope(result: unknown) {
  return JSON.stringify({ success: true, errors: [], messages: [], result });
}

function errorEnvelope(code: number, message: string) {
  return JSON.stringify({
    success: false,
    errors: [{ code, message }],
    messages: [],
    result: null,
  });
}

class MockCloudflareEmail extends CloudflareEmail {
  public request?: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };

  setResponse(body: BodyInit | null, status = 200): void {
    this._fetch = (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: init?.body as string | undefined,
      };
      return Promise.resolve(
        new Response(body, {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
  }
}

function client(): MockCloudflareEmail {
  const c = new MockCloudflareEmail({ accountId: ACCOUNT, auth: AUTH });
  c.setResponse(envelope({ delivered: ['recipient@example.com'], queued: [] }));
  return c;
}

describe('CloudflareEmail — configuration', () => {
  it('exposes the vendor name and account id', () => {
    const c = client();
    asserts.assertEquals(c.vendor, 'CloudflareEmail');
    asserts.assertEquals(c.accountId, ACCOUNT);
  });

  it('trims a padded account id', () => {
    const c = new MockCloudflareEmail({ accountId: '  acct-9  ', auth: AUTH });
    asserts.assertEquals(c.accountId, 'acct-9');
  });

  it('rejects a missing account id', () => {
    const err = asserts.assertThrows(
      () =>
        new MockCloudflareEmail(
          { auth: AUTH } as unknown as { accountId: string; auth: typeof AUTH },
        ),
      CloudflareEmailError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_ACCOUNT_ID');
  });

  it('rejects a blank account id', () => {
    const err = asserts.assertThrows(
      () => new MockCloudflareEmail({ accountId: '   ', auth: AUTH }),
      CloudflareEmailError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_ACCOUNT_ID');
  });

  it('rejects a missing API token', () => {
    const err = asserts.assertThrows(
      () =>
        new MockCloudflareEmail(
          { accountId: ACCOUNT } as unknown as {
            accountId: string;
            auth: typeof AUTH;
          },
        ),
      CloudflareEmailError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_API_TOKEN');
  });

  it('rejects a blank API token', () => {
    const err = asserts.assertThrows(
      () =>
        new MockCloudflareEmail({
          accountId: ACCOUNT,
          auth: { type: 'BEARER', token: '  ' },
        }),
      CloudflareEmailError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_API_TOKEN');
  });
});

describe('CloudflareEmail — send', () => {
  it('POSTs to the account-scoped send path with a Bearer token', async () => {
    const c = client();
    await c.send(validSend);
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assert(
      c.request!.url.endsWith(`/accounts/${ACCOUNT}/email/sending/send`),
      `unexpected url: ${c.request!.url}`,
    );
    const headers = c.request!.headers ?? {};
    const authHeader = headers['Authorization'] ?? headers['authorization'];
    asserts.assertEquals(authHeader, 'Bearer cf-token');
  });

  it('normalizes a bare string `to` into an array on the wire', async () => {
    const c = client();
    await c.send(validSend);
    const body = JSON.parse(c.request!.body!);
    asserts.assertEquals(body.to, ['recipient@example.com']);
  });

  it('passes an array `to` through unchanged and carries cc/bcc/reply_to', async () => {
    const c = client();
    await c.send({
      ...validSend,
      to: ['a@example.com', 'b@example.com'],
      cc: 'c@example.com',
      bcc: ['d@example.com'],
      reply_to: 'reply@example.com',
      headers: { 'X-Campaign-ID': 'welcome' },
    });
    const body = JSON.parse(c.request!.body!);
    asserts.assertEquals(body.to, ['a@example.com', 'b@example.com']);
    asserts.assertEquals(body.cc, ['c@example.com']);
    asserts.assertEquals(body.bcc, ['d@example.com']);
    asserts.assertEquals(body.reply_to, 'reply@example.com');
    asserts.assertEquals(body.headers['X-Campaign-ID'], 'welcome');
  });

  it('unwraps the client/v4 envelope and resolves to `result`', async () => {
    const c = client();
    c.setResponse(
      envelope({
        delivered: ['recipient@example.com'],
        queued: [],
        permanent_bounces: [],
        message_id: 'msg-1',
      }),
    );
    const result = await c.send(validSend);
    asserts.assertEquals(result.delivered, ['recipient@example.com']);
    asserts.assertEquals(result.message_id, 'msg-1');
    // The envelope's own keys must NOT leak into the resolved value.
    asserts.assertEquals(
      (result as Record<string, unknown>).success,
      undefined,
    );
  });

  it('keeps an additive vendor field rather than failing validation', async () => {
    const c = client();
    c.setResponse(
      envelope({ delivered: [], suppressed_recipients: ['x@example.com'] }),
    );
    const result = await c.send(validSend);
    asserts.assertEquals(result.suppressed_recipients, ['x@example.com']);
  });
});

describe('CloudflareEmail — local request validation', () => {
  it('rejects a send with neither html nor text', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.send({ from: 'a@b.com', to: 'c@d.com', subject: 'S' }),
      CloudflareEmailError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined); // nothing was sent
  });

  it('rejects a malformed from address before sending', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.send({ ...validSend, from: 'not-an-email' }),
      CloudflareEmailError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
  });

  it('rejects an empty recipient list', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.send({ ...validSend, to: [] }),
      CloudflareEmailError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
  });

  it('rejects more than 50 recipients counted across to/cc/bcc', async () => {
    const c = client();
    const many = (n: number, p: string) =>
      Array.from({ length: n }, (_, i) => `${p}${i}@example.com`);
    const err = await asserts.assertRejects(
      () =>
        c.send({
          ...validSend,
          to: many(30, 't'),
          cc: many(15, 'c'),
          bcc: many(6, 'b'), // 51 total
        }),
      CloudflareEmailError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
  });

  it('accepts exactly 50 recipients', async () => {
    const c = client();
    const many = (n: number, p: string) =>
      Array.from({ length: n }, (_, i) => `${p}${i}@example.com`);
    await c.send({ ...validSend, to: many(25, 't'), cc: many(25, 'c') });
    asserts.assertExists(c.request);
  });

  it('rejects an attachment whose content is not base64', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () =>
        c.send({
          ...validSend,
          attachments: [{
            content: 'not base64!!',
            filename: 'a.txt',
            type: 'text/plain',
          }],
        }),
      CloudflareEmailError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
  });

  it('accepts a well-formed base64 attachment', async () => {
    const c = client();
    await c.send({
      ...validSend,
      attachments: [{
        content: 'SGVsbG8=',
        filename: 'hello.txt',
        type: 'text/plain',
        disposition: 'attachment',
      }],
    });
    const body = JSON.parse(c.request!.body!);
    asserts.assertEquals(body.attachments[0].content, 'SGVsbG8=');
  });
});

describe('CloudflareEmail — error mapping', () => {
  const cases: [number, number, string][] = [
    [400, 10001, 'INVALID_REQUEST'],
    [400, 10200, 'MESSAGE_TOO_LARGE'],
    [401, 10101, 'AUTH_FAILED'],
    [403, 10102, 'FORBIDDEN'],
    [403, 10105, 'ACCOUNT_NOT_ENTITLED'],
    [429, 10004, 'RATE_LIMITED'],
    [500, 10002, 'SERVICE_UNAVAILABLE'],
  ];

  for (const [status, vendorCode, expected] of cases) {
    it(`maps vendor code ${vendorCode} to ${expected}`, async () => {
      const c = client();
      c.setResponse(
        errorEnvelope(vendorCode, `email.sending.error.${vendorCode}`),
        status,
      );
      const err = await asserts.assertRejects(
        () => c.send(validSend),
        CloudflareEmailError,
      );
      asserts.assertEquals(err.code, expected);
      asserts.assertEquals(err.getContextValue('vendorCode'), vendorCode);
    });
  }

  it('falls back to HTTP status when the body is not a recognizable envelope', async () => {
    const c = client();
    c.setResponse('<html>502 Bad Gateway</html>', 502);
    const err = await asserts.assertRejects(
      () => c.send(validSend),
      CloudflareEmailError,
    );
    asserts.assertEquals(err.code, 'SERVICE_UNAVAILABLE');
  });

  it('falls back to HTTP status for an unmapped vendor code', async () => {
    const c = client();
    c.setResponse(errorEnvelope(99999, 'email.sending.error.brand_new'), 429);
    const err = await asserts.assertRejects(
      () => c.send(validSend),
      CloudflareEmailError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
  });

  it('treats success:false on a 200 as a failure, not an empty send', async () => {
    const c = client();
    c.setResponse(
      errorEnvelope(10101, 'email.sending.error.unauthorized'),
      200,
    );
    const err = await asserts.assertRejects(
      () => c.send(validSend),
      CloudflareEmailError,
    );
    asserts.assertEquals(err.code, 'AUTH_FAILED');
  });

  it('raises RESPONSE_ERROR when a success body fails schema validation', async () => {
    const c = client();
    c.setResponse(envelope({ delivered: 'not-an-array' }));
    const err = await asserts.assertRejects(
      () => c.send(validSend),
      CloudflareEmailError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });

  it('never leaks the API token into a mapped vendor error', async () => {
    const c = client();
    c.setResponse(
      errorEnvelope(10101, 'email.sending.error.unauthorized'),
      401,
    );
    const err = await asserts.assertRejects(
      () => c.send(validSend),
      CloudflareEmailError,
    );
    asserts.assert(!JSON.stringify(err.toJSON()).includes('cf-token'));
  });
});

const env = envArgs();
const credentials = {
  accountId: env.get('CONNECTOR_CLOUDFLARE_EMAIL_ACCOUNT_ID'),
  token: env.get('CONNECTOR_CLOUDFLARE_EMAIL_API_TOKEN'),
  from: env.get('CONNECTOR_CLOUDFLARE_EMAIL_FROM'),
  to: env.get('CONNECTOR_CLOUDFLARE_EMAIL_TO'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'CloudflareEmail — live',
  // A real send is an irreversible, real-world-visible effect with no
  // delete/recall counterpart — Cloudflare has no "unsend". Gated behind
  // LIVE_TEST_ALLOW_VISIBLE_EFFECTS like Discord/Telegram/Twilio's sends,
  // and therefore never fired by the monthly CI schedule.
  ignore: !liveTestsEnabled || !env.get('LIVE_TEST_ALLOW_VISIBLE_EFFECTS'),
  bun: false,
  node: false,
  fn: () => {
    it('sends a real email through the Email Sending API', async () => {
      const c = new CloudflareEmail({
        accountId: credentials.accountId!,
        auth: { type: 'BEARER', token: credentials.token!, prefix: 'Bearer' },
      });
      const result = await c.send({
        from: credentials.from!,
        to: credentials.to!,
        subject: 'tundra-connect live test',
        text: 'Live test from @tundraconnect/cloudflare-email.',
      });
      asserts.assertExists(result);
    });
  },
});
