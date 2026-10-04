import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import {
  GoogleAnalytics,
  type GoogleAnalyticsOptions,
} from './GoogleAnalytics.ts';
import { GoogleAnalyticsError } from './errors/mod.ts';
import type { PayloadSchema } from './schema/mod.ts';

const SECRET = 'ga-api-secret-0000';
const AUTH = { type: 'CUSTOM' as const, apiSecret: SECRET };
const MEASUREMENT = 'G-TEST123456';

const payload: PayloadSchema = {
  client_id: '123456789.1700000000',
  events: [{
    name: 'link_click',
    params: { link_id: 'abc', session_id: 1700000000, engagement_time_msec: 1 },
  }],
};

type Captured = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

class MockGA extends GoogleAnalytics {
  public request?: Captured;

  setResponse(
    body: unknown,
    status = 204,
    headers: Record<string, string> = { 'content-type': 'application/json' },
  ): void {
    const text = body === null
      ? null
      : typeof body === 'string'
      ? body
      : JSON.stringify(body);
    this._fetch = (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: init?.body as string | undefined,
      };
      return Promise.resolve(new Response(text, { status, headers }));
    };
  }

  url(): URL {
    return new URL(this.request!.url);
  }

  json(): Record<string, unknown> {
    return JSON.parse(this.request?.body ?? '{}');
  }
}

function client(extra: Partial<GoogleAnalyticsOptions> = {}): MockGA {
  const c = new MockGA({ auth: AUTH, measurementId: MEASUREMENT, ...extra });
  c.setResponse(null, 204);
  return c;
}

describe('GoogleAnalytics — configuration', () => {
  it('exposes the vendor name and stream id', () => {
    const c = client();
    asserts.assertEquals(c.vendor, 'GoogleAnalytics');
    asserts.assertEquals(c.measurementId, MEASUREMENT);
    asserts.assertEquals(c.firebaseAppId, undefined);
  });

  it('rejects a missing, non-CUSTOM or blank api secret', () => {
    for (
      const options of [
        { measurementId: MEASUREMENT },
        { measurementId: MEASUREMENT, auth: { type: 'BEARER', token: 'x' } },
        {
          measurementId: MEASUREMENT,
          auth: { type: 'CUSTOM', apiSecret: ' ' },
        },
      ]
    ) {
      const err = asserts.assertThrows(
        () => new MockGA(options as unknown as GoogleAnalyticsOptions),
        GoogleAnalyticsError,
      );
      asserts.assertEquals(err.code, 'CONFIG_INVALID_AUTH');
    }
  });

  it('requires exactly one stream id', () => {
    for (
      const options of [
        { auth: AUTH },
        { auth: AUTH, measurementId: MEASUREMENT, firebaseAppId: '1:2:web:3' },
        { auth: AUTH, measurementId: '  ' },
      ]
    ) {
      const err = asserts.assertThrows(
        () => new MockGA(options as unknown as GoogleAnalyticsOptions),
        GoogleAnalyticsError,
      );
      asserts.assertEquals(err.code, 'CONFIG_INVALID_STREAM');
    }
  });

  it('rejects an unknown region', () => {
    const err = asserts.assertThrows(
      () =>
        new MockGA({
          auth: AUTH,
          measurementId: MEASUREMENT,
          region: 'us' as never,
        }),
      GoogleAnalyticsError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_REGION');
  });
});

describe('GoogleAnalytics — send', () => {
  it('POSTs JSON to /mp/collect with api_secret and measurement_id in the query', async () => {
    const c = client();
    await c.send(payload);
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assertEquals(c.url().origin, 'https://www.google-analytics.com');
    asserts.assertEquals(c.url().pathname, '/mp/collect');
    asserts.assertEquals(c.url().searchParams.get('api_secret'), SECRET);
    asserts.assertEquals(
      c.url().searchParams.get('measurement_id'),
      MEASUREMENT,
    );
    asserts.assertEquals(
      c.json(),
      payload as unknown as Record<string, unknown>,
    );
  });

  it('uses the EU endpoint for region eu', async () => {
    const c = client({ region: 'eu' });
    await c.send(payload);
    asserts.assertEquals(
      c.url().origin,
      'https://region1.google-analytics.com',
    );
  });

  it('uses firebase_app_id and app_instance_id for an app stream', async () => {
    const c = new MockGA({ auth: AUTH, firebaseAppId: '1:123:android:abc' });
    c.setResponse(null, 204);
    await c.send({
      app_instance_id: 'cbd7e7ee7a6d4e5b9a4a3f1c2b0e9d8f',
      events: [{ name: 'screen_view' }],
    });
    asserts.assertEquals(
      c.url().searchParams.get('firebase_app_id'),
      '1:123:android:abc',
    );
    asserts.assertEquals(c.url().searchParams.has('measurement_id'), false);
  });

  it('accepts a 200 with an empty body too', async () => {
    const c = client();
    c.setResponse('', 200, { 'content-type': 'text/plain' });
    await c.send(payload);
  });

  it('sends every documented top-level field unchanged', async () => {
    const c = client();
    const full: PayloadSchema = {
      ...payload,
      user_id: 'user-42',
      timestamp_micros: 1_700_000_000_000_000,
      user_properties: { plan: { value: 'pro' } },
      consent: { ad_user_data: 'DENIED', ad_personalization: 'DENIED' },
      user_location: { country_id: 'IN' },
      device: { category: 'mobile', language: 'en' },
      non_personalized_ads: true,
    };
    await c.send(full);
    asserts.assertEquals(c.json(), full as unknown as Record<string, unknown>);
  });
});

describe('GoogleAnalytics — validate', () => {
  it('POSTs to /debug/mp/collect and reports a clean payload as valid', async () => {
    const c = client();
    c.setResponse({ validationMessages: [] }, 200);
    const result = await c.validate(payload);
    asserts.assertEquals(c.url().pathname, '/debug/mp/collect');
    asserts.assertEquals(result, { valid: true, validationMessages: [] });
  });

  it("returns Google's validation messages as data", async () => {
    const c = client();
    const messages = [{
      fieldPath: 'events',
      description: 'Event at index: [0] has invalid name [linkClick!].',
      validationCode: 'NAME_INVALID',
    }];
    c.setResponse({ validationMessages: messages }, 200);
    const result = await c.validate(payload);
    asserts.assertEquals(result.valid, false);
    asserts.assertEquals(result.validationMessages, messages);
  });

  it('reads a body without validationMessages as valid', async () => {
    const c = client();
    c.setResponse({}, 200);
    asserts.assertEquals((await c.validate(payload)).valid, true);
  });

  it('parses a JSON body served as text', async () => {
    const c = client();
    c.setResponse('{"validationMessages":[]}', 200, {
      'content-type': 'text/plain',
    });
    asserts.assertEquals((await c.validate(payload)).valid, true);
  });

  it('raises RESPONSE_ERROR for a body of the wrong shape', async () => {
    const c = client();
    c.setResponse({ validationMessages: 'none' }, 200);
    const err = await asserts.assertRejects(
      () => c.validate(payload),
      GoogleAnalyticsError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });
});

describe('GoogleAnalytics — local validation', () => {
  const rejects = async (
    p: PayloadSchema,
    fragment: string,
    options: Partial<GoogleAnalyticsOptions> = {},
  ) => {
    const c = client(options);
    const err = await asserts.assertRejects(
      () => c.send(p),
      GoogleAnalyticsError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertStringIncludes(
      String(err.getContextValue('reason')),
      fragment,
    );
    asserts.assertEquals(c.request, undefined);
    return String(err.getContextValue('reason'));
  };
  const event = (name: string, params?: Record<string, unknown>) => ({
    ...payload,
    events: [{ name, params }],
  });

  it('requires client_id for a web stream', async () => {
    await rejects({ events: payload.events }, 'client_id');
  });

  it('requires 1–25 events', async () => {
    await rejects({ ...payload, events: [] }, 'events');
    await rejects(
      {
        ...payload,
        events: Array.from({ length: 26 }, () => ({ name: 'e' })),
      },
      '1–25',
    );
  });

  it('checks event names: format, length, reserved names and prefixes', async () => {
    await rejects(event('link-click'), 'must start with a letter');
    await rejects(event('1click'), 'must start with a letter');
    await rejects(event('x'.repeat(41)), '40 characters');
    await rejects(event('session_start'), 'reserved by GA4');
    await rejects(event('ga_custom'), '`ga_` prefix');
    await rejects(event('_hidden'), '`_` prefix');
  });

  it('checks params: count, names and string length', async () => {
    const many = Object.fromEntries(
      Array.from({ length: 26 }, (_, i) => [`p${i}`, i]),
    );
    await rejects(event('e', many), 'at most 25 parameters');
    await rejects(event('e', { 'bad-name': 1 }), 'must start with a letter');
    await rejects(event('e', { google_x: 1 }), '`google_` prefix');
    await rejects(event('e', { v: 'x'.repeat(101) }), '100 characters');
  });

  it('allows 500-character values on a GA360 property', async () => {
    const c = client({ ga360: true });
    await c.send(event('e', { v: 'x'.repeat(500) }));
    await asserts.assertRejects(
      () => c.send(event('e', { v: 'x'.repeat(501) })),
      GoogleAnalyticsError,
    );
  });

  it('checks user properties: count, names, reserved names, values', async () => {
    const many = Object.fromEntries(
      Array.from({ length: 26 }, (_, i) => [`u${i}`, { value: i }]),
    );
    await rejects({ ...payload, user_properties: many }, 'at most 25');
    await rejects(
      { ...payload, user_properties: { ['x'.repeat(25)]: { value: 1 } } },
      '24 characters',
    );
    await rejects(
      { ...payload, user_properties: { first_visit_time: { value: 1 } } },
      'reserved by GA4',
    );
    await rejects(
      { ...payload, user_properties: { plan: { value: 'x'.repeat(37) } } },
      '36 characters',
    );
    await rejects(
      { ...payload, user_properties: { plan: {} } },
      'user_properties',
    );
  });

  it('reports every problem at once', async () => {
    const reason = await rejects(
      {
        events: [{ name: 'session_start', params: { v: 'x'.repeat(200) } }],
      },
      'client_id',
    );
    asserts.assertStringIncludes(reason, 'reserved by GA4');
    asserts.assertStringIncludes(reason, '100 characters');
  });

  it('rejects a payload of 130kB or more', async () => {
    const big = Array.from({ length: 25 }, () => ({
      name: 'e',
      params: Object.fromEntries(
        Array.from({ length: 25 }, (_, i) => [`p${i}`, 'x'.repeat(100)]),
      ),
    }));
    // 25 × 25 × 100 characters is ~62kB; pad with user_data to cross 130kB.
    await rejects(
      { ...payload, events: big, user_data: { blob: 'x'.repeat(80_000) } },
      'bytes',
    );
  });

  it('rejects schema-level mistakes', async () => {
    await rejects(
      { ...payload, consent: { ad_user_data: 'YES' as never } },
      'consent',
    );
    await rejects(
      { ...payload, timestamp_micros: '1700' as unknown as number },
      'timestamp_micros',
    );
  });
});

describe('GoogleAnalytics — failures', () => {
  const byStatus: [number, string, boolean][] = [
    [400, 'INVALID_REQUEST', false],
    [401, 'AUTH_FAILED', false],
    [403, 'AUTH_FAILED', false],
    [429, 'RATE_LIMITED', true],
    [500, 'SERVICE_UNAVAILABLE', true],
    [503, 'SERVICE_UNAVAILABLE', true],
  ];
  for (const [status, expected, transient] of byStatus) {
    it(`maps HTTP ${status} to ${expected}`, async () => {
      const c = client();
      c.setResponse('nope', status, {
        'content-type': 'text/plain',
        'retry-after': '4',
      });
      const err = await asserts.assertRejects(
        () => c.send(payload),
        GoogleAnalyticsError,
      );
      asserts.assertEquals(err.code, expected);
      asserts.assertEquals(err.transient, transient);
      asserts.assertEquals(err.getContextValue('status'), status);
      if (status === 429) {
        asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 4);
      }
    });
  }

  it('throws a transient TIMEOUT when no answer arrives within the timeout', async () => {
    const c = client({ timeout: 1 });
    c['_fetch'] = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(init.signal!.reason),
        );
      });
    const err = await asserts.assertRejects(
      () => c.send(payload),
      GoogleAnalyticsError,
    );
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1);
  });

  it('throws a transient NETWORK_ERROR when fetch itself fails', async () => {
    const c = client();
    c['_fetch'] = () => Promise.reject(new TypeError('error sending request'));
    const err = await asserts.assertRejects(
      () => c.send(payload),
      GoogleAnalyticsError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
  });

  it('never leaks the api secret into any error', async () => {
    const arms: ((c: MockGA) => void)[] = [
      (c) => c.setResponse('nope', 403, { 'content-type': 'text/plain' }),
      (c) => c.setResponse('nope', 500, { 'content-type': 'text/plain' }),
      (c) => {
        // Real fetch errors embed the full request URL, secret included.
        c['_fetch'] = (input) =>
          Promise.reject(
            new TypeError(`error sending request for url (${String(input)})`),
          );
      },
    ];
    for (const arm of arms) {
      const c = client();
      arm(c);
      const err = await asserts.assertRejects(
        () => c.send(payload),
        GoogleAnalyticsError,
      );
      const serialized = JSON.stringify(err.toJSON()) + err.message +
        String(err.cause instanceof Error ? err.cause.message : '');
      asserts.assertEquals(serialized.includes(SECRET), false);
    }
  });
});

describe('GoogleAnalytics — maxRetryWait (RESTler rate-limit retry)', () => {
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockGA({
      auth: AUTH,
      measurementId: MEASUREMENT,
      maxRetryWait,
    });
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
      () => c.send(payload),
      GoogleAnalyticsError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws RATE_LIMITED immediately with retried: false when the hint exceeds maxRetryWait', async () => {
    const { c, slept, calls } = throttled(5, '120');
    const err = await asserts.assertRejects(
      () => c.send(payload),
      GoogleAnalyticsError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

const env = envArgs();
const credentials = {
  measurementId: env.get('CONNECTOR_GOOGLE_ANALYTICS_MEASUREMENT_ID'),
  apiSecret: env.get('CONNECTOR_GOOGLE_ANALYTICS_API_SECRET'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'GoogleAnalytics — live',
  // validate() records nothing, so it runs whenever credentials are set.
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    const live = () =>
      new GoogleAnalytics({
        auth: { type: 'CUSTOM', apiSecret: credentials.apiSecret! },
        measurementId: credentials.measurementId!,
        timeout: 15,
      });

    it('validates a clean payload against the debug endpoint', async () => {
      const result = await live().validate({
        client_id: '123456789.1700000000',
        events: [{
          name: 'tundra_connect_live_test',
          params: { session_id: 1700000000, engagement_time_msec: 1 },
        }],
      });
      asserts.assertEquals(result.valid, true, JSON.stringify(result));
    });

    it('reports a problem only Google catches as a validation message', async () => {
      // A string where Google expects a number: not a local rule.
      const result = await live().validate({
        client_id: '123456789.1700000000',
        validation_behavior: 'ENFORCE_RECOMMENDATIONS',
        events: [{
          name: 'purchase',
          params: { currency: 'NOT_A_CURRENCY', value: 'ten' },
        }],
      });
      asserts.assert(Array.isArray(result.validationMessages));
    });
  },
});

describe({
  name: 'GoogleAnalytics — live send',
  // A real hit lands in the property's reports and cannot be removed, so
  // it is gated like every other real-world-visible live test.
  ignore: !liveTestsEnabled || !env.get('LIVE_TEST_ALLOW_VISIBLE_EFFECTS'),
  bun: false,
  node: false,
  fn: () => {
    it('sends one event', async () => {
      await new GoogleAnalytics({
        auth: { type: 'CUSTOM', apiSecret: credentials.apiSecret! },
        measurementId: credentials.measurementId!,
      }).send({
        client_id: '123456789.1700000000',
        events: [{ name: 'tundra_connect_live_test' }],
      });
    });
  },
});
