import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { GoogleWebRisk, type GoogleWebRiskOptions } from './GoogleWebRisk.ts';
import { GoogleWebRiskError } from './errors/mod.ts';

const API_KEY = 'AIzaSy-test-key-do-not-leak';
const KEY_AUTH = { type: 'CUSTOM' as const, apiKey: API_KEY };

type Captured = {
  url: string;
  method?: string;
  headers: Record<string, string>;
};

class MockGoogleWebRisk extends GoogleWebRisk {
  public request?: Captured;

  setResponse(
    body: BodyInit | null,
    status = 200,
    headers: Record<string, string> = { 'content-type': 'application/json' },
  ): void {
    this._fetch = (input, init) => {
      this.capture(input, init);
      return Promise.resolve(new Response(body, { status, headers }));
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
      return Promise.reject(
        new TypeError(`error sending request for url (${String(input)})`),
      );
    };
  }

  private capture(input: RequestInfo | URL, init?: RequestInit): void {
    this.request = {
      url: String(input),
      method: init?.method,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    };
  }
}

function client(
  overrides: Partial<GoogleWebRiskOptions> = {},
): MockGoogleWebRisk {
  const c = new MockGoogleWebRisk({ auth: KEY_AUTH, ...overrides });
  c.setResponse('{}');
  return c;
}

/** Every `threatTypes` value on the captured request URL, in order. */
function threatTypesOf(url: string): string[] {
  return new URL(url).searchParams.getAll('threatTypes');
}

describe('GoogleWebRisk — configuration', () => {
  it('constructs with an API key and names its vendor', () => {
    asserts.assertEquals(client().vendor, 'GoogleWebRisk');
  });

  it('rejects a missing auth', () => {
    const err = asserts.assertThrows(
      () => new MockGoogleWebRisk({} as unknown as GoogleWebRiskOptions),
      GoogleWebRiskError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_AUTH');
  });

  it('rejects a blank API key', () => {
    const err = asserts.assertThrows(
      () => new MockGoogleWebRisk({ auth: { type: 'CUSTOM', apiKey: '  ' } }),
      GoogleWebRiskError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_AUTH');
  });

  it('rejects an unsupported auth type', () => {
    const err = asserts.assertThrows(
      () =>
        new MockGoogleWebRisk({
          auth: { type: 'BASIC', username: 'u', password: 'p' },
        } as unknown as GoogleWebRiskOptions),
      GoogleWebRiskError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_AUTH');
  });

  it('rejects a timeout RESTler cannot honour', () => {
    asserts.assertThrows(() => client({ timeout: 0.5 }));
  });
});

describe('GoogleWebRisk — search request', () => {
  it('GETs /v1/uris:search on webrisk.googleapis.com', async () => {
    const c = client();
    await c.search({ uri: 'https://example.com/' });
    const url = new URL(c.request!.url);
    asserts.assertEquals(c.request!.method, 'GET');
    asserts.assertEquals(url.origin, 'https://webrisk.googleapis.com');
    asserts.assertEquals(url.pathname, '/v1/uris:search');
  });

  it('sends the uri, encoded', async () => {
    const c = client();
    await c.search({ uri: 'https://example.com/a b?x=1&y=2' });
    asserts.assertStringIncludes(
      c.request!.url,
      'uri=https%3A%2F%2Fexample.com%2Fa%20b%3Fx%3D1%26y%3D2',
    );
    asserts.assertEquals(
      new URL(c.request!.url).searchParams.get('uri'),
      'https://example.com/a b?x=1&y=2',
    );
  });

  it('repeats threatTypes once per list, defaulting to the three core lists', async () => {
    const c = client();
    await c.search({ uri: 'https://example.com/' });
    asserts.assertEquals(threatTypesOf(c.request!.url), [
      'MALWARE',
      'SOCIAL_ENGINEERING',
      'UNWANTED_SOFTWARE',
    ]);
  });

  it('sends exactly the requested lists, de-duplicated', async () => {
    const c = client();
    await c.search({
      uri: 'https://example.com/',
      threatTypes: [
        'SOCIAL_ENGINEERING_EXTENDED_COVERAGE',
        'MALWARE',
        'MALWARE',
      ],
    });
    asserts.assertEquals(threatTypesOf(c.request!.url), [
      'SOCIAL_ENGINEERING_EXTENDED_COVERAGE',
      'MALWARE',
    ]);
  });

  it('sends the API key in X-Goog-Api-Key, never in the URL', async () => {
    const c = client();
    await c.search({ uri: 'https://example.com/' });
    asserts.assertEquals(c.request!.headers['x-goog-api-key'], API_KEY);
    asserts.assertEquals(c.request!.url.includes(API_KEY), false);
    asserts.assertEquals(
      new URL(c.request!.url).searchParams.has('key'),
      false,
    );
  });

  it('sends an OAuth token as `Authorization: Bearer`', async () => {
    const c = client({ auth: { type: 'BEARER', token: 'ya29.token' } });
    await c.search({ uri: 'https://example.com/' });
    asserts.assertEquals(
      c.request!.headers['authorization'],
      'Bearer ya29.token',
    );
    asserts.assertEquals(c.request!.headers['x-goog-api-key'], undefined);
  });

  it('keeps the API key out of the `call` event payload', async () => {
    const c = client();
    const seen: string[] = [];
    c.on('call', (_vendor, request, response) => {
      seen.push(JSON.stringify(request), JSON.stringify(response));
    });
    await c.search({ uri: 'https://example.com/' });
    asserts.assertEquals(seen.length, 2);
    for (const payload of seen) {
      asserts.assertEquals(payload.includes(API_KEY), false);
    }
  });
});

describe('GoogleWebRisk — search verdicts', () => {
  it('maps {} to listed: false', async () => {
    const c = client();
    asserts.assertEquals(await c.search({ uri: 'https://example.com/' }), {
      listed: false,
    });
  });

  it('maps a threat to listed: true with a Date expiry (nanosecond input)', async () => {
    const c = client();
    c.setResponse(JSON.stringify({
      threat: {
        threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING'],
        expireTime: '2019-07-17T15:01:23.045123456Z',
      },
    }));
    const verdict = await c.search({ uri: 'http://bad.example/' });
    asserts.assert(verdict.listed);
    asserts.assertEquals(verdict.threatTypes, [
      'MALWARE',
      'SOCIAL_ENGINEERING',
    ]);
    asserts.assertEquals(
      verdict.expiresOn?.toISOString(),
      '2019-07-17T15:01:23.045Z',
    );
  });

  it('gives expiresOn: null when expireTime is absent', async () => {
    const c = client();
    c.setResponse(JSON.stringify({ threat: { threatTypes: ['MALWARE'] } }));
    const verdict = await c.search({ uri: 'http://bad.example/' });
    asserts.assert(verdict.listed);
    asserts.assertEquals(verdict.expiresOn, null);
  });

  it('gives expiresOn: null when expireTime does not parse', async () => {
    const c = client();
    c.setResponse(JSON.stringify({
      threat: { threatTypes: ['MALWARE'], expireTime: 'not-a-date' },
    }));
    const verdict = await c.search({ uri: 'http://bad.example/' });
    asserts.assert(verdict.listed);
    asserts.assertEquals(verdict.expiresOn, null);
  });

  it('treats a threat with no lists as not listed', async () => {
    const c = client();
    c.setResponse(JSON.stringify({ threat: { threatTypes: [] } }));
    asserts.assertEquals(
      (await c.search({ uri: 'https://example.com/' })).listed,
      false,
    );
  });

  it('rejects a body that is not a uris:search response', async () => {
    const c = client();
    c.setResponse(JSON.stringify({ threat: { threatTypes: 'MALWARE' } }));
    const err = await asserts.assertRejects(
      () => c.search({ uri: 'https://example.com/' }),
      GoogleWebRiskError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
    asserts.assertEquals(err.transient, false);
  });
});

describe('GoogleWebRisk — local validation', () => {
  const cases: Array<[string, Parameters<GoogleWebRisk['search']>[0]]> = [
    ['a blank uri', { uri: '' }],
    ['an unknown threat type', {
      uri: 'https://example.com/',
      threatTypes: ['PHISHING' as never],
    }],
    ['an empty threat type list', {
      uri: 'https://example.com/',
      threatTypes: [],
    }],
    ['a sub-second timeout', { uri: 'https://example.com/', timeout: 0.5 }],
    ['a timeout over 120 s', { uri: 'https://example.com/', timeout: 121 }],
    ['a NaN timeout', { uri: 'https://example.com/', timeout: Number.NaN }],
  ];
  for (const [label, options] of cases) {
    it(`rejects ${label} without sending anything`, async () => {
      const c = client();
      const err = await asserts.assertRejects(
        () => c.search(options),
        GoogleWebRiskError,
      );
      asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
      asserts.assertEquals(c.request, undefined);
    });
  }

  it('names the failing field in the reason', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.search({ uri: '' }),
      GoogleWebRiskError,
    );
    asserts.assertStringIncludes(String(err.getContextValue('reason')), 'uri:');
  });
});

describe('GoogleWebRisk — transport failures', () => {
  it('throws a transient TIMEOUT once a fractional per-call deadline passes', async () => {
    const c = client();
    c.hang();
    const started = performance.now();
    const err = await asserts.assertRejects(
      () => c.search({ uri: 'https://example.com/', timeout: 1.2 }),
      GoogleWebRiskError,
    );
    const elapsed = performance.now() - started;
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1.2);
    asserts.assert(elapsed >= 1150 && elapsed < 2000, `took ${elapsed}ms`);
  });

  it('applies the client-level timeout when the call sets none', async () => {
    const c = client({ timeout: 1 });
    c.hang();
    const err = await asserts.assertRejects(
      () => c.search({ uri: 'https://example.com/' }),
      GoogleWebRiskError,
    );
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1);
  });

  it('throws a transient NETWORK_ERROR when fetch itself fails', async () => {
    const c = client();
    c.failNetwork();
    const err = await asserts.assertRejects(
      () => c.search({ uri: 'https://example.com/' }),
      GoogleWebRiskError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
  });

  it('keeps the API key out of every failure message and context', async () => {
    for (const fail of ['hang', 'failNetwork'] as const) {
      const c = client({ timeout: 1 });
      c[fail]();
      const err = await asserts.assertRejects(
        () => c.search({ uri: 'https://example.com/' }),
        GoogleWebRiskError,
      );
      const serialized = JSON.stringify(err.toJSON()) + err.message +
        String(err.stack) + String((err.cause as Error | undefined)?.message);
      asserts.assertEquals(serialized.includes(API_KEY), false, fail);
    }
  });
});

describe('GoogleWebRisk — vendor error mapping', () => {
  function googleError(
    code: number,
    status: string,
    message: string,
    reason?: string,
  ): string {
    return JSON.stringify({
      error: {
        code,
        message,
        status,
        details: reason
          ? [{
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason,
            domain: 'googleapis.com',
          }]
          : [],
      },
    });
  }

  it('maps a 400 API_KEY_INVALID to AUTH_FAILED, not INVALID_REQUEST', async () => {
    const c = client();
    c.setResponse(
      googleError(
        400,
        'INVALID_ARGUMENT',
        'API key not valid. Please pass a valid API key.',
        'API_KEY_INVALID',
      ),
      400,
    );
    const err = await asserts.assertRejects(
      () => c.search({ uri: 'https://example.com/' }),
      GoogleWebRiskError,
    );
    asserts.assertEquals(err.code, 'AUTH_FAILED');
    asserts.assertEquals(err.transient, false);
    asserts.assertEquals(
      err.getContextValue('vendorReason'),
      'API_KEY_INVALID',
    );
  });

  it('maps any other 400 to INVALID_REQUEST with the vendor message', async () => {
    const c = client();
    c.setResponse(
      googleError(400, 'INVALID_ARGUMENT', "Invalid value at 'uri'"),
      400,
    );
    const err = await asserts.assertRejects(
      () => c.search({ uri: 'https://example.com/' }),
      GoogleWebRiskError,
    );
    asserts.assertEquals(err.code, 'INVALID_REQUEST');
    asserts.assertStringIncludes(err.message, "Invalid value at 'uri'");
    asserts.assertEquals(
      err.getContextValue('vendorStatus'),
      'INVALID_ARGUMENT',
    );
  });

  it('maps 403 to FORBIDDEN', async () => {
    const c = client();
    c.setResponse(
      googleError(
        403,
        'PERMISSION_DENIED',
        'Web Risk API has not been used in project 123',
        'SERVICE_DISABLED',
      ),
      403,
    );
    const err = await asserts.assertRejects(
      () => c.search({ uri: 'https://example.com/' }),
      GoogleWebRiskError,
    );
    asserts.assertEquals(err.code, 'FORBIDDEN');
    asserts.assertEquals(err.transient, false);
  });

  it('maps 429 to a transient RATE_LIMITED with the retry hint', async () => {
    const c = client();
    c.setResponse(
      googleError(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded'),
      429,
      { 'content-type': 'application/json', 'retry-after': '30' },
    );
    const err = await asserts.assertRejects(
      () => c.search({ uri: 'https://example.com/' }),
      GoogleWebRiskError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 30);
  });

  it('maps an HTML 503 to a transient SERVICE_UNAVAILABLE', async () => {
    const c = client();
    c.setResponse('<html>busy</html>', 503, { 'content-type': 'text/html' });
    const err = await asserts.assertRejects(
      () => c.search({ uri: 'https://example.com/' }),
      GoogleWebRiskError,
    );
    asserts.assertEquals(err.code, 'SERVICE_UNAVAILABLE');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('status'), 503);
    asserts.assertStringIncludes(err.message, 'no detail');
  });

  it('keeps the API key out of a vendor error', async () => {
    const c = client();
    c.setResponse(googleError(500, 'INTERNAL', 'boom'), 500);
    const err = await asserts.assertRejects(
      () => c.search({ uri: 'https://example.com/' }),
      GoogleWebRiskError,
    );
    asserts.assertEquals(
      (JSON.stringify(err.toJSON()) + err.message).includes(API_KEY),
      false,
    );
  });
});

const env = envArgs();
const credentials = { apiKey: env.get('CONNECTOR_GOOGLE_WEB_RISK_API_KEY') };
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'GoogleWebRisk — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    const live = () =>
      new GoogleWebRisk({
        auth: { type: 'CUSTOM', apiKey: credentials.apiKey! },
        timeout: 5,
      });

    it("flags Google's own malware test page", async () => {
      const verdict = await live().search({
        uri: 'http://testsafebrowsing.appspot.com/s/malware.html',
        threatTypes: ['MALWARE'],
      });
      asserts.assert(verdict.listed);
      asserts.assertEquals(verdict.threatTypes, ['MALWARE']);
    });

    it('reports a well-known safe site as not listed', async () => {
      const verdict = await live().search({ uri: 'https://www.google.com/' });
      asserts.assertEquals(verdict.listed, false);
    });
  },
});
