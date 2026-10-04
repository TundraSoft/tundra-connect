import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import {
  CloudflareTurnstile,
  type CloudflareTurnstileOptions,
  TURNSTILE_DUMMY_SECRETS,
  TURNSTILE_DUMMY_TOKEN,
  type VerifyOptions,
} from './CloudflareTurnstile.ts';
import { CloudflareTurnstileError } from './errors/mod.ts';

const SECRET = 'test-secret-key-0000';
const AUTH = { type: 'CUSTOM' as const, secretKey: SECRET };
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

type Captured = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

class MockTurnstile extends CloudflareTurnstile {
  public request?: Captured;

  setResponse(
    body: unknown,
    status = 200,
    headers: Record<string, string> = { 'content-type': 'application/json' },
  ): void {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    this._fetch = (input, init) => {
      this.capture(input, init);
      return Promise.resolve(new Response(text, { status, headers }));
    };
  }

  /** A transport that never answers on its own — only the abort ends it. */
  hang(): void {
    this._fetch = (input, init) => {
      this.capture(input, init);
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal!.reason);
        });
      });
    };
  }

  /** A transport that fails the way `fetch` does on a DNS/socket error. */
  failNetwork(): void {
    this._fetch = (input, init) => {
      this.capture(input, init);
      return Promise.reject(new TypeError('error sending request'));
    };
  }

  /** The captured JSON body, parsed. */
  json(): Record<string, unknown> {
    return JSON.parse(this.request?.body ?? '{}');
  }

  private capture(input: RequestInfo | URL, init?: RequestInit): void {
    this.request = {
      url: String(input),
      method: init?.method,
      headers: init?.headers as Record<string, string> | undefined,
      body: init?.body as string | undefined,
    };
  }
}

function client(
  extra: Partial<CloudflareTurnstileOptions> = {},
): MockTurnstile {
  const c = new MockTurnstile({ auth: AUTH, ...extra });
  c.setResponse({
    success: true,
    'error-codes': [],
    challenge_ts: '2026-10-04T12:00:00.000Z',
    hostname: 'example.com',
    action: 'login',
  });
  return c;
}

describe('CloudflareTurnstile — configuration', () => {
  it('exposes the vendor name', () => {
    asserts.assertEquals(client().vendor, 'CloudflareTurnstile');
  });

  it('rejects a missing auth', () => {
    const err = asserts.assertThrows(
      () => new MockTurnstile({} as unknown as CloudflareTurnstileOptions),
      CloudflareTurnstileError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_SECRET_KEY');
  });

  it('rejects a non-CUSTOM auth', () => {
    const err = asserts.assertThrows(
      () =>
        new MockTurnstile({
          auth: { type: 'BEARER', token: SECRET },
        } as unknown as CloudflareTurnstileOptions),
      CloudflareTurnstileError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_SECRET_KEY');
  });

  it('rejects a blank secret key', () => {
    const err = asserts.assertThrows(
      () => new MockTurnstile({ auth: { type: 'CUSTOM', secretKey: '  ' } }),
      CloudflareTurnstileError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_SECRET_KEY');
  });

  it('ships the documented dummy keys and token', () => {
    asserts.assertEquals(TURNSTILE_DUMMY_TOKEN, 'XXXX.DUMMY.TOKEN.XXXX');
    asserts.assertEquals(
      TURNSTILE_DUMMY_SECRETS.alwaysPasses,
      '1x0000000000000000000000000000000AA',
    );
  });
});

describe('CloudflareTurnstile — request', () => {
  it('POSTs JSON to /turnstile/v0/siteverify with the secret in the body', async () => {
    const c = client();
    await c.verify({ response: TOKEN });
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assert(
      c.request!.url.endsWith('/turnstile/v0/siteverify'),
      `unexpected url: ${c.request!.url}`,
    );
    const headers = c.request!.headers ?? {};
    const contentType = headers['Content-Type'] ?? headers['content-type'];
    asserts.assertStringIncludes(String(contentType), 'application/json');
    asserts.assertEquals(
      headers['Authorization'] ?? headers['authorization'],
      undefined,
    );
    asserts.assertEquals(c.json(), { secret: SECRET, response: TOKEN });
  });

  it('carries remoteip and idempotency_key when given, and omits them otherwise', async () => {
    const c = client();
    await c.verify({
      response: TOKEN,
      remoteip: '203.0.113.7',
      idempotency_key: '0f3c9a3e-1b2d-4c5e-8f9a-0b1c2d3e4f5a',
    });
    asserts.assertEquals(c.json(), {
      secret: SECRET,
      response: TOKEN,
      remoteip: '203.0.113.7',
      idempotency_key: '0f3c9a3e-1b2d-4c5e-8f9a-0b1c2d3e4f5a',
    });
  });

  it('never sends the connect-level options to Cloudflare', async () => {
    const c = client();
    await c.verify({
      response: TOKEN,
      expectedHostname: 'example.com',
      expectedAction: 'login',
      timeout: 5,
    });
    asserts.assertEquals(Object.keys(c.json()).sort(), ['response', 'secret']);
  });
});

describe('CloudflareTurnstile — verdicts', () => {
  it('resolves a success verdict with every field', async () => {
    const c = client();
    c.setResponse({
      success: true,
      'error-codes': [],
      challenge_ts: '2026-10-04T12:00:00.000Z',
      hostname: 'example.com',
      action: 'login',
      cdata: 'session-1',
      metadata: { ephemeral_id: 'x:1' },
    });
    const verdict = await c.verify({ response: TOKEN });
    asserts.assertEquals(verdict.success, true);
    asserts.assertEquals(verdict.hostname, 'example.com');
    asserts.assertEquals(verdict.cdata, 'session-1');
    asserts.assertEquals(verdict.metadata?.ephemeral_id, 'x:1');
  });

  it('resolves — does not throw — a failed challenge', async () => {
    const c = client();
    c.setResponse({
      success: false,
      'error-codes': ['invalid-input-response'],
    });
    const verdict = await c.verify({ response: TOKEN });
    asserts.assertEquals(verdict.success, false);
    asserts.assertEquals(verdict['error-codes'], ['invalid-input-response']);
  });

  it('resolves an already-spent token as timeout-or-duplicate', async () => {
    const c = client();
    c.setResponse({
      success: false,
      'error-codes': ['timeout-or-duplicate'],
    });
    const verdict = await c.verify({ response: TOKEN });
    asserts.assertEquals(verdict.success, false);
    asserts.assertEquals(verdict['error-codes'], ['timeout-or-duplicate']);
  });

  it('keeps an additive vendor field rather than failing validation', async () => {
    const c = client();
    c.setResponse({ success: true, brand_new: 'value' });
    const verdict = await c.verify({ response: TOKEN });
    asserts.assertEquals(
      (verdict as Record<string, unknown>).brand_new,
      'value',
    );
  });
});

describe('CloudflareTurnstile — expectations', () => {
  it('passes when the hostname and action match', async () => {
    const verdict = await client().verify({
      response: TOKEN,
      expectedHostname: 'example.com',
      expectedAction: 'login',
    });
    asserts.assertEquals(verdict.success, true);
    asserts.assertEquals(verdict['error-codes'], []);
  });

  it('compares hostnames case-insensitively and accepts a list', async () => {
    const verdict = await client().verify({
      response: TOKEN,
      expectedHostname: ['www.example.com', 'EXAMPLE.com'],
    });
    asserts.assertEquals(verdict.success, true);
  });

  it('demotes a hostname mismatch to success: false with hostname-mismatch', async () => {
    const verdict = await client().verify({
      response: TOKEN,
      expectedHostname: 'other.example',
    });
    asserts.assertEquals(verdict.success, false);
    asserts.assertEquals(verdict['error-codes'], ['hostname-mismatch']);
    // The rest of Cloudflare's verdict is kept for diagnostics.
    asserts.assertEquals(verdict.hostname, 'example.com');
  });

  it('treats a verdict without a hostname as a mismatch when one is expected', async () => {
    const c = client();
    c.setResponse({ success: true });
    const verdict = await c.verify({
      response: TOKEN,
      expectedHostname: 'example.com',
    });
    asserts.assertEquals(verdict.success, false);
    asserts.assertEquals(verdict['error-codes'], ['hostname-mismatch']);
  });

  it('demotes an action mismatch, and reports both when both fail', async () => {
    const one = await client().verify({
      response: TOKEN,
      expectedAction: 'signup',
    });
    asserts.assertEquals(one.success, false);
    asserts.assertEquals(one['error-codes'], ['action-mismatch']);

    const both = await client().verify({
      response: TOKEN,
      expectedHostname: 'other.example',
      expectedAction: 'signup',
    });
    asserts.assertEquals(both['error-codes'], [
      'hostname-mismatch',
      'action-mismatch',
    ]);
  });

  it('leaves a verdict Cloudflare already failed untouched', async () => {
    const c = client();
    c.setResponse({
      success: false,
      'error-codes': ['invalid-input-response'],
      hostname: 'other.example',
    });
    const verdict = await c.verify({
      response: TOKEN,
      expectedHostname: 'example.com',
    });
    asserts.assertEquals(verdict['error-codes'], ['invalid-input-response']);
  });
});

describe('CloudflareTurnstile — local request validation', () => {
  const rejects = async (options: VerifyOptions, fragment: string) => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.verify(options),
      CloudflareTurnstileError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertStringIncludes(
      String(err.getContextValue('reason')),
      fragment,
    );
    asserts.assertEquals(c.request, undefined); // nothing was sent
  };

  it('rejects an empty token', async () => {
    await rejects({ response: '' }, 'response');
  });

  it('rejects a missing token', async () => {
    await rejects({} as VerifyOptions, 'response');
  });

  it('rejects an over-long token', async () => {
    await rejects({ response: 'x'.repeat(2049) }, '2048');
  });

  it('rejects a blank remoteip', async () => {
    await rejects({ response: TOKEN, remoteip: '' }, 'remoteip');
  });

  it('rejects an out-of-range or non-numeric timeout', async () => {
    await rejects({ response: TOKEN, timeout: 0 }, 'timeout');
    await rejects({ response: TOKEN, timeout: 121 }, 'timeout');
    await rejects(
      { response: TOKEN, timeout: 'soon' as unknown as number },
      'timeout',
    );
  });

  it('rejects a malformed expectedHostname or expectedAction', async () => {
    await rejects(
      { response: TOKEN, expectedHostname: '' },
      'expectedHostname',
    );
    await rejects(
      { response: TOKEN, expectedHostname: [] },
      'expectedHostname',
    );
    await rejects(
      { response: TOKEN, expectedHostname: ['ok.example', ' '] },
      'expectedHostname',
    );
    await rejects({ response: TOKEN, expectedAction: '' }, 'expectedAction');
  });

  it('falls back to the schema message when the request is not an object', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.verify('tok' as unknown as VerifyOptions),
      CloudflareTurnstileError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assert(String(err.getContextValue('reason')).length > 0);
  });
});

describe('CloudflareTurnstile — call failures', () => {
  const inBand: [string[], string, boolean][] = [
    [['invalid-input-secret'], 'AUTH_FAILED', false],
    [['missing-input-secret'], 'AUTH_FAILED', false],
    [['bad-request'], 'INVALID_REQUEST', false],
    [['missing-input-response'], 'INVALID_REQUEST', false],
    [['internal-error'], 'SERVICE_UNAVAILABLE', true],
    // The secret takes precedence over a token code riding along with it.
    [['invalid-input-response', 'invalid-input-secret'], 'AUTH_FAILED', false],
  ];

  for (const [codes, expected, transient] of inBand) {
    it(`throws ${expected} for ${codes.join('+')} on a 200`, async () => {
      const c = client();
      c.setResponse({ success: false, 'error-codes': codes });
      const err = await asserts.assertRejects(
        () => c.verify({ response: TOKEN }),
        CloudflareTurnstileError,
      );
      asserts.assertEquals(err.code, expected);
      asserts.assertEquals(err.transient, transient);
      asserts.assertEquals(err.getContextValue('status'), 200);
      asserts.assertEquals(err.getContextValue('vendorCodes'), codes.join(','));
    });
  }

  const byStatus: [number, unknown, string, boolean][] = [
    [
      400,
      { success: false, 'error-codes': ['bad-request'] },
      'INVALID_REQUEST',
      false,
    ],
    [401, '', 'AUTH_FAILED', false],
    [403, '{"message":"forbidden"}', 'AUTH_FAILED', false],
    [429, '', 'RATE_LIMITED', true],
    [500, 'internal', 'SERVICE_UNAVAILABLE', true],
    [502, '<html>502 Bad Gateway</html>', 'SERVICE_UNAVAILABLE', true],
  ];

  for (const [status, body, expected, transient] of byStatus) {
    it(`maps HTTP ${status} to ${expected}`, async () => {
      const c = client();
      c.setResponse(body, status, {
        'content-type': typeof body === 'string'
          ? 'text/html'
          : 'application/json',
        'retry-after': '7',
      });
      const err = await asserts.assertRejects(
        () => c.verify({ response: TOKEN }),
        CloudflareTurnstileError,
      );
      asserts.assertEquals(err.code, expected);
      asserts.assertEquals(err.transient, transient);
      asserts.assertEquals(err.getContextValue('status'), status);
      if (status === 429) {
        asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 7);
      }
    });
  }

  it('raises RESPONSE_ERROR when a 200 body has no boolean success', async () => {
    for (const body of [{}, { success: 'yes' }, 'ok']) {
      const c = client();
      c.setResponse(body);
      const err = await asserts.assertRejects(
        () => c.verify({ response: TOKEN }),
        CloudflareTurnstileError,
      );
      asserts.assertEquals(err.code, 'RESPONSE_ERROR');
    }
  });

  it('throws a transient TIMEOUT once the per-call deadline passes', async () => {
    const c = client();
    c.hang();
    const started = performance.now();
    const err = await asserts.assertRejects(
      () => c.verify({ response: TOKEN, timeout: 1.2 }),
      CloudflareTurnstileError,
    );
    const elapsed = performance.now() - started;
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1.2);
    asserts.assert(elapsed >= 1150 && elapsed < 2500, `took ${elapsed}ms`);
  });

  it('applies the client-level timeout when the call sets none', async () => {
    const c = client({ timeout: 1 });
    c.hang();
    const err = await asserts.assertRejects(
      () => c.verify({ response: TOKEN }),
      CloudflareTurnstileError,
    );
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1);
  });

  it('throws a transient NETWORK_ERROR when fetch itself fails', async () => {
    const c = client();
    c.failNetwork();
    const err = await asserts.assertRejects(
      () => c.verify({ response: TOKEN }),
      CloudflareTurnstileError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
  });

  it('never leaks the secret key into any error', async () => {
    const scenarios: ((c: MockTurnstile) => void)[] = [
      (c) =>
        c.setResponse({
          success: false,
          'error-codes': ['invalid-input-secret'],
        }),
      (c) => c.setResponse('nope', 500, { 'content-type': 'text/plain' }),
      (c) => c.setResponse({}),
      (c) => c.failNetwork(),
      (c) => c.hang(),
    ];
    for (const arm of scenarios) {
      const c = client({ timeout: 1 });
      arm(c);
      const err = await asserts.assertRejects(
        () => c.verify({ response: TOKEN }),
        CloudflareTurnstileError,
      );
      const serialized = JSON.stringify(err.toJSON()) + err.message +
        String(err.cause instanceof Error ? err.cause.message : '');
      asserts.assertEquals(serialized.includes(SECRET), false);
    }
  });
});

describe('CloudflareTurnstile — maxRetryWait (RESTler rate-limit retry)', () => {
  /**
   * A client whose every request is answered 429 with a `retry-after` hint,
   * and whose waits are recorded instead of slept. `maxRetryWait` is what
   * routes a 429 to RESTler's retry logic (and so to this connect's
   * `RESTlerRateLimitError` rewrap) — without it the vendor handler maps the
   * 429 directly, which the call-failure tests already cover.
   */
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockTurnstile({ auth: AUTH, maxRetryWait });
    const slept: number[] = [];
    let calls = 0;
    c['_sleep'] = (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    };
    c['_fetch'] = (_input) => {
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
      () => c.verify({ response: TOKEN }),
      CloudflareTurnstileError,
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
      () => c.verify({ response: TOKEN }),
      CloudflareTurnstileError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

const env = envArgs();
const credentials = {
  secretKey: env.get('CONNECTOR_CLOUDFLARE_TURNSTILE_SECRET_KEY'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'CloudflareTurnstile — live',
  // Turnstile needs no account to exercise: Cloudflare publishes dummy
  // secret keys that accept a dummy token and behave as named. The env var
  // only opts the suite in (any value works, the dummy "always passes"
  // secret is a sensible one); the configured key is exercised once with
  // the dummy token, then the three dummy secrets cover every verdict.
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    const live = (secretKey: string) =>
      new CloudflareTurnstile({
        auth: { type: 'CUSTOM', secretKey },
        timeout: 15,
      });

    it('returns a well-formed verdict for the configured secret and the dummy token', async () => {
      const verdict = await live(credentials.secretKey!).verify({
        response: TURNSTILE_DUMMY_TOKEN,
      });
      asserts.assertEquals(typeof verdict.success, 'boolean');
    });

    it('passes with the always-passes dummy secret', async () => {
      const verdict = await live(TURNSTILE_DUMMY_SECRETS.alwaysPasses).verify({
        response: TURNSTILE_DUMMY_TOKEN,
        idempotency_key: crypto.randomUUID(),
      });
      asserts.assertEquals(verdict.success, true);
    });

    it('fails with the always-fails dummy secret, as an answer not an error', async () => {
      const verdict = await live(TURNSTILE_DUMMY_SECRETS.alwaysFails).verify({
        response: TURNSTILE_DUMMY_TOKEN,
      });
      asserts.assertEquals(verdict.success, false);
      asserts.assert((verdict['error-codes'] ?? []).length > 0);
    });

    it('reports timeout-or-duplicate with the already-spent dummy secret', async () => {
      const verdict = await live(TURNSTILE_DUMMY_SECRETS.alreadySpent).verify({
        response: TURNSTILE_DUMMY_TOKEN,
      });
      asserts.assertEquals(verdict.success, false);
      asserts.assert(
        (verdict['error-codes'] ?? []).includes('timeout-or-duplicate'),
        String(verdict['error-codes']),
      );
    });

    it('throws AUTH_FAILED for a secret Cloudflare does not know', async () => {
      const err = await asserts.assertRejects(
        () =>
          live('0x0000000000000000000000000000000AA').verify({
            response: TURNSTILE_DUMMY_TOKEN,
          }),
        CloudflareTurnstileError,
      );
      asserts.assertEquals(err.code, 'AUTH_FAILED');
    });
  },
});
