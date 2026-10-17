import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import {
  GoogleCertificateManager,
  type GoogleCertificateManagerOptions,
} from './GoogleCertificateManager.ts';
import { GoogleCertificateManagerError } from './errors/mod.ts';
import { hostnameToResourceId } from './resourceId.ts';

// Generated solely for these tests (shared with the gcs connect's suite) — a
// throwaway PKCS8 RSA key tied to no real service account. Exercises the
// real Web Crypto signing path end to end.
const TEST_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDI9qL5wbAEBZno
eLflk1gJrIJAuXGBO30l2LQBjkcI2PjYUaaNArCWdqHNlY8Oj6ivBUSm/kZwsouB
IbaHw27Xnq9GCa8xLzxvfs7SkLl7EX1FJDMkhfWK5Z4ACCiUPBnsYx0/13qlXTKk
QQlipEr3OLvBcS5AHRlHpwMABQ5IVFN77hUHBcKCNuucH1970gRppy+5OkPUU2LH
+fV1bH9clcurI8CEonoXewrOcoDXElMQzqNwSMGJoCkesD0W/7MNW2W3PS4SQLrE
FCHKVILCXwfdkYda838cIBBXIyMf85/Q5nV1eotWps8k8V5be9riyu930RNRM7/R
JAcgSf3hAgMBAAECggEAALEmDdlxOLeoOFkKERFOe/dgb3FJXG+PARgGQ/xwbthd
wFOaUOFR0wLPkHypBHIm24tsxBfGDadKZwRts3lPIruaJjyW94K5IOJ9OykNFR5n
TFtROG6kUiPI79PCCANOTOET0woekv6HfnH24qRm2a5pVG4xAZQtZ8YXHY3m5wWE
aq9ngVeBPyRz6EfYnQRIc2pvroEyad/VAUp/2/Lr7xZRYbwtlM5UaB9vsQTE4iBT
eY77t+nAarvmOrmJdL0wh3XcL0VPcs2JscQXSQDgLgZfYdw1kka0cK0ifgl3VpTX
S3G3gDyvT6TQmR8E7+6MgepH4H1uiRdslBYGu89s0QKBgQDpiommhFhEkJp+Tovw
MDGCBn+mR9H+/vuXxsVw5NHE5vHahxEP889uFwluH35wAUz8EFflYyPlEF91jaT+
DIAs7Sa0Z++hGe1l4Jq4lBOKvFQzFmguBBIehUTq8y2QnQ0I8Rgm55WpyW+BouQ4
EmMZjv5pykptRaB3c3oLzXdQDQKBgQDcShRtqf4fzynLYkZqKDMTLZY4lppGpKmb
mQXWHMOzQ9GK+7u8ry0uRvSopVsH4OCj5RimWJ3ekdnjo3WtJP3lb40znodYqI3B
03UxhLljJlBTML9b0FPlo9Efhgnxv5Pq4CvE9s5TwUGdvvzSxbWQBWLhEcK+aKSs
Xz8sSfIcJQKBgDN8RzxekNcMygJubotVFJUFub5+ttzweabMO1rYFybBgzAZ9rj9
lw0+JuYQK1+l6cLoF3iKkq89HM5dm7ImL1u4LIA5KarqfFupWHK4slYzjpx0pCMA
4r23w6nIUpM/DFCcVia9h1EXB24c6xMxeod37r6DykSsxOOQoadYdKVBAoGBALnW
CMvGx6ogAtsf6dUuWoAISh0s97M2wBqSifjpxTKauNAts1/mzA+pLkaDUHsh+4Bo
CVZzlaKomg7O27wYY9RFOfJc/0MM1qG3+LqwhBCfxs2XZydWZSBqBUY5tnPpsShI
usPrjX3cn7Uq5HAO+C8qTBMg/4/QCXOc2ldLfmK9AoGAcV6yF51/9QMdX5liHvmr
DMr8xAq5u8ZBU/Uj01anGy2k7gEBj0VgzONpu1ypcc/wWfqTS6G8xRYYt8JIqNaZ
lSoKtwuiZak8CXW248b9WXe4SHjVAYFt9+XrcESNbvYvK35YoaQMXVHrT8htp89G
5v4C7ULsQDbju4a+7xU5Uyc=
-----END PRIVATE KEY-----`;

const PROJECT = 'my-project';
const MAP = 'customer-domains';
const PARENT = `/v1/projects/${PROJECT}/locations/global`;
const BEARER = { type: 'BEARER', token: 'ya29.test-token' } as const;
const SERVICE_ACCOUNT = {
  type: 'CUSTOM',
  clientEmail: 'certs@my-project.iam.gserviceaccount.com',
  privateKey: TEST_PRIVATE_KEY_PEM,
} as const;

type Captured = {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

type Reply = { status?: number; body?: unknown; headers?: HeadersInit };

/** Answers queued replies in order and records every request. */
class MockCM extends GoogleCertificateManager {
  public requests: Captured[] = [];
  private replies: (Reply | (() => Promise<Response>))[] = [];

  constructor(options: Partial<GoogleCertificateManagerOptions> = {}) {
    super({
      auth: BEARER,
      projectId: PROJECT,
      certificateMapId: MAP,
      ...options,
    } as GoogleCertificateManagerOptions);
    this._fetch = (input, init) => {
      const headers: Record<string, string> = {};
      for (const [k, v] of new Headers(init?.headers as HeadersInit)) {
        headers[k] = v;
      }
      this.requests.push({
        url: new URL(String(input)),
        method: init?.method ?? 'GET',
        headers,
        body: typeof init?.body === 'string'
          ? init.body
          : init?.body instanceof URLSearchParams
          ? init.body.toString()
          : undefined,
      });
      const reply = this.replies.shift();
      if (!reply) {
        return Promise.reject(new Error(`no reply queued for ${input}`));
      }
      if (typeof reply === 'function') return reply();
      return Promise.resolve(
        new Response(
          reply.body === undefined ? null : JSON.stringify(reply.body),
          {
            status: reply.status ?? 200,
            headers: reply.headers ?? { 'content-type': 'application/json' },
          },
        ),
      );
    };
  }

  reply(...replies: (Reply | (() => Promise<Response>))[]): this {
    this.replies.push(...replies);
    return this;
  }

  last(): Captured {
    return this.requests.at(-1)!;
  }

  json(): Record<string, unknown> {
    return JSON.parse(this.last().body ?? '{}');
  }
}

const certificate = (id: string, state = 'PROVISIONING') => ({
  name: `projects/${PROJECT}/locations/global/certificates/${id}`,
  createTime: '2026-10-17T10:00:00.123456789Z',
  sanDnsnames: ['go.example.com'],
  scope: 'DEFAULT',
  managed: {
    domains: ['go.example.com'],
    state,
    provisioningIssue: {
      reason: 'AUTHORIZATION_ISSUE',
      details: 'Authorization attempt failed',
    },
    authorizationAttemptInfo: [{
      domain: 'go.example.com',
      state: 'FAILED',
      failureReason: 'CONFIG',
      details: 'The A record does not point at the load balancer',
    }],
  },
});

const entry = (id: string) => ({
  name:
    `projects/${PROJECT}/locations/global/certificateMaps/${MAP}/certificateMapEntries/${id}`,
  hostname: 'go.example.com',
  certificates: [`projects/${PROJECT}/locations/global/certificates/${id}`],
  state: 'PENDING',
});

const OP_NAME = `projects/${PROJECT}/locations/global/operations/operation-1`;
const operation = (extra: Record<string, unknown> = {}) => ({
  name: OP_NAME,
  metadata: {
    '@type':
      'type.googleapis.com/google.cloud.certificatemanager.v1.OperationMetadata',
    verb: 'create',
  },
  done: false,
  ...extra,
});

const googleError = (
  code: number,
  status: string,
  message: string,
  reason?: string,
) => ({
  error: {
    code,
    status,
    message,
    ...(reason
      ? {
        details: [{
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason,
        }],
      }
      : {}),
  },
});

async function rejects(
  fn: () => Promise<unknown>,
  code: string,
): Promise<GoogleCertificateManagerError> {
  const err = await asserts.assertRejects(fn, GoogleCertificateManagerError);
  asserts.assertEquals(err.code, code, err.message);
  return err;
}

describe('GoogleCertificateManager — configuration', () => {
  it('exposes vendor, project, location and map', () => {
    const c = new MockCM();
    asserts.assertEquals(c.vendor, 'GoogleCertificateManager');
    asserts.assertEquals(c.projectId, PROJECT);
    asserts.assertEquals(c.location, 'global');
    asserts.assertEquals(c.certificateMapId, MAP);
    asserts.assertEquals(
      new MockCM({ location: 'us-central1' }).location,
      'us-central1',
    );
  });

  it('accepts numeric and domain-scoped project ids', () => {
    new MockCM({ projectId: '123456789012' });
    new MockCM({ projectId: 'example.com:my-project' });
  });

  it('rejects missing or malformed auth', () => {
    const base = { projectId: PROJECT };
    const cases: unknown[] = [
      undefined,
      { type: 'BASIC', username: 'u', password: 'p' },
      { type: 'BEARER', token: '  ' },
    ];
    for (const auth of cases) {
      const err = asserts.assertThrows(
        () =>
          new GoogleCertificateManager(
            { ...base, auth } as GoogleCertificateManagerOptions,
          ),
        GoogleCertificateManagerError,
      );
      asserts.assertEquals(err.code, 'CONFIG_INVALID_AUTH');
    }
  });

  it('rejects a service account without clientEmail or privateKey', () => {
    for (const field of ['clientEmail', 'privateKey'] as const) {
      const err = asserts.assertThrows(
        () =>
          new GoogleCertificateManager({
            projectId: PROJECT,
            auth: { ...SERVICE_ACCOUNT, [field]: '' },
          }),
        GoogleCertificateManagerError,
      );
      asserts.assertEquals(err.code, 'CONFIG_INVALID_SERVICE_ACCOUNT');
      asserts.assertEquals(err.getContextValue('field'), field);
    }
  });

  it('rejects a missing or malformed project, location or map id', () => {
    const cases: Partial<GoogleCertificateManagerOptions>[] = [
      { projectId: undefined },
      { projectId: 'My_Project' },
      { projectId: '../other' },
      { location: 'Global/..' },
      { certificateMapId: 'Bad.Map' },
    ];
    for (const extra of cases) {
      const options = { auth: BEARER, projectId: PROJECT, ...extra };
      if ('projectId' in extra && extra.projectId === undefined) {
        delete (options as Partial<GoogleCertificateManagerOptions>).projectId;
      }
      const err = asserts.assertThrows(
        () =>
          new GoogleCertificateManager(
            options as GoogleCertificateManagerOptions,
          ),
        GoogleCertificateManagerError,
      );
      asserts.assertEquals(err.code, 'CONFIG_INVALID_PROJECT');
    }
  });

  it('sends a BEARER token with the Bearer scheme by default', async () => {
    const c = new MockCM().reply({ body: certificate('a-1') });
    await c.getCertificate('a-1');
    asserts.assertEquals(
      c.last().headers['authorization'],
      'Bearer ya29.test-token',
    );
  });
});

describe('GoogleCertificateManager — service-account auth', () => {
  const token = (accessToken = 'ya29.minted', expiresIn = 3600) => ({
    body: {
      access_token: accessToken,
      expires_in: expiresIn,
      token_type: 'Bearer',
    },
  });

  it('signs an RS256 JWT, exchanges it, and sends the minted token', async () => {
    const c = new MockCM({ auth: SERVICE_ACCOUNT })
      .reply(token(), { body: certificate('a-1') });
    await c.getCertificate('a-1');

    const [exchange, call] = c.requests;
    asserts.assertEquals(
      exchange!.url.toString(),
      'https://oauth2.googleapis.com/token',
    );
    asserts.assertEquals(exchange!.method, 'POST');
    const form = new URLSearchParams(exchange!.body);
    asserts.assertEquals(
      form.get('grant_type'),
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
    );
    const [header, payload] = form.get('assertion')!.split('.').slice(0, 2).map(
      (s) => JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/'))),
    );
    asserts.assertEquals(header.alg, 'RS256');
    asserts.assertEquals(payload.iss, SERVICE_ACCOUNT.clientEmail);
    asserts.assertEquals(payload.aud, 'https://oauth2.googleapis.com/token');
    asserts.assertEquals(
      payload.scope,
      'https://www.googleapis.com/auth/cloud-platform',
    );
    asserts.assertEquals(exchange!.headers['authorization'], undefined);
    asserts.assertEquals(call!.headers['authorization'], 'Bearer ya29.minted');
  });

  it('reuses a cached token and shares one exchange across concurrent calls', async () => {
    const c = new MockCM({ auth: SERVICE_ACCOUNT }).reply(
      token(),
      { body: certificate('a-1') },
      { body: certificate('b-1') },
      { body: certificate('c-1') },
    );
    await Promise.all([c.getCertificate('a-1'), c.getCertificate('b-1')]);
    await c.getCertificate('c-1');
    const exchanges = c.requests.filter((r) =>
      r.url.host === 'oauth2.googleapis.com'
    );
    asserts.assertEquals(exchanges.length, 1);
    asserts.assertEquals(c.requests.length, 4);
  });

  it('refreshes a token that is about to expire', async () => {
    const c = new MockCM({ auth: SERVICE_ACCOUNT }).reply(
      token('ya29.short', 30),
      { body: certificate('a-1') },
      token('ya29.fresh'),
      { body: certificate('a-1') },
    );
    await c.getCertificate('a-1');
    await c.getCertificate('a-1');
    asserts.assertEquals(
      c.last().headers['authorization'],
      'Bearer ya29.fresh',
    );
  });

  it('maps an OAuth refusal to TOKEN_EXCHANGE_FAILED without leaking the assertion', async () => {
    const c = new MockCM({ auth: SERVICE_ACCOUNT }).reply({
      status: 400,
      body: {
        error: 'invalid_grant',
        error_description: 'Invalid JWT Signature.',
      },
    });
    const err = await rejects(
      () => c.getCertificate('a-1'),
      'TOKEN_EXCHANGE_FAILED',
    );
    asserts.assertEquals(err.transient, false);
    asserts.assertEquals(err.getContextValue('vendorError'), 'invalid_grant');
    asserts.assertEquals(err.message.includes('PRIVATE KEY'), false);
  });

  it('treats a 5xx or 429 from the token endpoint as transient', async () => {
    const c5 = new MockCM({ auth: SERVICE_ACCOUNT }).reply({
      status: 503,
      body: { error: 'backend' },
    });
    const e5 = await rejects(
      () => c5.getCertificate('a-1'),
      'SERVICE_UNAVAILABLE',
    );
    asserts.assertEquals(e5.transient, true);
    const c429 = new MockCM({ auth: SERVICE_ACCOUNT }).reply({
      status: 429,
      body: {},
    });
    await rejects(() => c429.getCertificate('a-1'), 'RATE_LIMITED');
  });

  it('maps a malformed token response to TOKEN_EXCHANGE_FAILED', async () => {
    const c = new MockCM({ auth: SERVICE_ACCOUNT }).reply({
      body: { token_type: 'Bearer' },
    });
    await rejects(() => c.getCertificate('a-1'), 'TOKEN_EXCHANGE_FAILED');
  });

  it('maps an unusable private key to JWT_SIGNING_FAILED', async () => {
    const c = new MockCM({
      auth: { ...SERVICE_ACCOUNT, privateKey: 'not a pem' },
    });
    const err = await rejects(
      () => c.getCertificate('a-1'),
      'JWT_SIGNING_FAILED',
    );
    asserts.assertEquals(c.requests.length, 0);
    asserts.assertEquals(err.message.includes('not a pem'), false);
  });

  it('does not cache a failed exchange', async () => {
    const c = new MockCM({ auth: SERVICE_ACCOUNT }).reply(
      { status: 503, body: {} },
      token(),
      { body: certificate('a-1') },
    );
    await rejects(() => c.getCertificate('a-1'), 'SERVICE_UNAVAILABLE');
    await c.getCertificate('a-1');
    asserts.assertEquals(c.requests.length, 3);
  });
});

describe('GoogleCertificateManager — certificates', () => {
  it('creates a managed certificate', async () => {
    const c = new MockCM().reply({ body: operation() });
    const op = await c.createCertificate({
      certificateId: 'go-example-com-1',
      domains: ['go.example.com'],
      description: 'Brevily customer domain',
      labels: { owner: 'brevily' },
      scope: 'DEFAULT',
    });
    asserts.assertEquals(op.name, OP_NAME);
    asserts.assertEquals(op.done, false);
    const req = c.last();
    asserts.assertEquals(req.method, 'POST');
    asserts.assertEquals(req.url.pathname, `${PARENT}/certificates`);
    asserts.assertEquals(
      req.url.searchParams.get('certificateId'),
      'go-example-com-1',
    );
    asserts.assertEquals(c.json(), {
      managed: { domains: ['go.example.com'] },
      description: 'Brevily customer domain',
      labels: { owner: 'brevily' },
      scope: 'DEFAULT',
    });
  });

  it('passes dnsAuthorizations through when given', async () => {
    const c = new MockCM().reply({ body: operation() });
    await c.createCertificate({
      certificateId: 'wildcard-1',
      domains: ['*.example.com'],
      dnsAuthorizations: ['projects/p/locations/global/dnsAuthorizations/d'],
    });
    asserts.assertEquals(c.json().managed, {
      domains: ['*.example.com'],
      dnsAuthorizations: ['projects/p/locations/global/dnsAuthorizations/d'],
    });
  });

  it('validates create input before sending anything', async () => {
    const c = new MockCM();
    const bad: unknown[] = [
      { certificateId: 'Go.Example.com', domains: ['go.example.com'] },
      { certificateId: '1abc', domains: ['go.example.com'] },
      { certificateId: 'abc-', domains: ['go.example.com'] },
      { certificateId: 'a'.repeat(64), domains: ['go.example.com'] },
      { certificateId: 'ok', domains: [] },
      { certificateId: 'ok', domains: [''] },
      { certificateId: 'ok', domains: ['a'], dnsAuthorizations: [] },
      undefined,
    ];
    for (const options of bad) {
      await rejects(
        () => c.createCertificate(options as never),
        'REQUEST_VALIDATION_ERROR',
      );
    }
    asserts.assertEquals(c.requests.length, 0);
  });

  it('reads a certificate with its provisioning detail', async () => {
    const c = new MockCM().reply({ body: certificate('go-example-com-1') });
    const cert = await c.getCertificate('go-example-com-1');
    asserts.assertEquals(
      c.last().url.pathname,
      `${PARENT}/certificates/go-example-com-1`,
    );
    asserts.assertEquals(cert.managed?.state, 'PROVISIONING');
    asserts.assertEquals(
      cert.managed?.provisioningIssue?.reason,
      'AUTHORIZATION_ISSUE',
    );
    asserts.assertEquals(
      cert.managed?.authorizationAttemptInfo?.[0]?.failureReason,
      'CONFIG',
    );
  });

  it('rejects a path-traversal id', async () => {
    const c = new MockCM();
    await rejects(
      () => c.getCertificate('../certificateMaps/x'),
      'REQUEST_VALIDATION_ERROR',
    );
    asserts.assertEquals(c.requests.length, 0);
  });

  it('lists a page with paging, filter and order', async () => {
    const c = new MockCM().reply({
      body: {
        certificates: [certificate('a-1'), certificate('b-1', 'ACTIVE')],
        nextPageToken: 'next',
      },
    });
    const page = await c.listCertificates({
      pageSize: 50,
      pageToken: 'tok',
      filter: 'labels.owner="brevily"',
      orderBy: 'name desc',
    });
    asserts.assertEquals(page.certificates.length, 2);
    asserts.assertEquals(page.nextPageToken, 'next');
    asserts.assertEquals(page.unreachable, []);
    asserts.assertEquals(
      Object.fromEntries(c.last().url.searchParams),
      {
        pageSize: '50',
        pageToken: 'tok',
        filter: 'labels.owner="brevily"',
        orderBy: 'name desc',
      },
    );
    // RFC 3986 encoding: a space is %20, never +.
    asserts.assertStringIncludes(c.last().url.search, 'orderBy=name%20desc');
  });

  it('normalises an empty page', async () => {
    const c = new MockCM().reply({ body: {} });
    const page = await c.listCertificates();
    asserts.assertEquals(page, { certificates: [], unreachable: [] });
    asserts.assertEquals(c.last().url.search, '');
  });

  it('rejects an invalid pageSize', async () => {
    const c = new MockCM();
    for (const pageSize of [0, -1, 1.5]) {
      await rejects(
        () => c.listCertificates({ pageSize }),
        'REQUEST_VALIDATION_ERROR',
      );
    }
  });

  it('iterates every page', async () => {
    const c = new MockCM().reply(
      { body: { certificates: [certificate('a-1')], nextPageToken: 'p2' } },
      { body: { certificates: [certificate('b-1')] } },
    );
    const names: string[] = [];
    for await (const cert of c.iterateCertificates({ pageSize: 1 })) {
      names.push(cert.name.split('/').at(-1)!);
    }
    asserts.assertEquals(names, ['a-1', 'b-1']);
    asserts.assertEquals(
      c.requests[0]!.url.searchParams.get('pageToken'),
      null,
    );
    asserts.assertEquals(
      c.requests[1]!.url.searchParams.get('pageToken'),
      'p2',
    );
  });

  it('deletes a certificate', async () => {
    const c = new MockCM().reply({ body: operation({ done: true }) });
    const op = await c.deleteCertificate('go-example-com-1');
    asserts.assertEquals(op.done, true);
    asserts.assertEquals(c.last().method, 'DELETE');
    asserts.assertEquals(
      c.last().url.pathname,
      `${PARENT}/certificates/go-example-com-1`,
    );
  });

  it('maps a malformed success body to RESPONSE_ERROR', async () => {
    const c = new MockCM().reply({ body: { managed: {} } });
    const err = await rejects(
      () => c.getCertificate('a-1'),
      'RESPONSE_ERROR',
    );
    asserts.assertEquals(err.transient, false);
  });
});

describe('GoogleCertificateManager — certificate map entries', () => {
  const ENTRIES = `${PARENT}/certificateMaps/${MAP}/certificateMapEntries`;

  it('creates an entry, expanding certificate ids to full names', async () => {
    const c = new MockCM().reply({ body: operation() });
    await c.createCertificateMapEntry({
      entryId: 'go-example-com-1',
      hostname: ' go.example.com ',
      certificates: [
        'go-example-com-1',
        'projects/other/locations/global/certificates/shared',
      ],
      labels: { owner: 'brevily' },
      description: 'customer',
    });
    const req = c.last();
    asserts.assertEquals(req.method, 'POST');
    asserts.assertEquals(req.url.pathname, ENTRIES);
    asserts.assertEquals(
      req.url.searchParams.get('certificateMapEntryId'),
      'go-example-com-1',
    );
    asserts.assertEquals(c.json(), {
      hostname: 'go.example.com',
      certificates: [
        `projects/${PROJECT}/locations/global/certificates/go-example-com-1`,
        'projects/other/locations/global/certificates/shared',
      ],
      description: 'customer',
      labels: { owner: 'brevily' },
    });
  });

  it('uses a per-call mapId over the client default', async () => {
    const c = new MockCM().reply({ body: entry('a-1') });
    await c.getCertificateMapEntry('a-1', { mapId: 'other-map' });
    asserts.assertEquals(
      c.last().url.pathname,
      `${PARENT}/certificateMaps/other-map/certificateMapEntries/a-1`,
    );
  });

  it('requires a map id when the client has none', async () => {
    const c = new MockCM({ certificateMapId: undefined });
    const err = await rejects(
      () => c.getCertificateMapEntry('a-1'),
      'REQUEST_VALIDATION_ERROR',
    );
    asserts.assertStringIncludes(err.message, 'mapId');
    await rejects(
      () => c.listCertificateMapEntries({ mapId: 'Bad Map' }),
      'REQUEST_VALIDATION_ERROR',
    );
  });

  it('validates create input before sending anything', async () => {
    const c = new MockCM();
    const ok = {
      entryId: 'a-1',
      hostname: 'go.example.com',
      certificates: ['a-1'],
    };
    const bad: unknown[] = [
      { ...ok, entryId: 'A-1' },
      { ...ok, hostname: '' },
      { ...ok, certificates: [] },
      { ...ok, certificates: ['a', 'b', 'c', 'd', 'e'] },
      { ...ok, certificates: ['Not An Id'] },
      { ...ok, certificates: ['projects/p/locations/global/certificates/..'] },
    ];
    for (const options of bad) {
      await rejects(
        () => c.createCertificateMapEntry(options as never),
        'REQUEST_VALIDATION_ERROR',
      );
    }
    asserts.assertEquals(c.requests.length, 0);
  });

  it('reads, lists, iterates and deletes entries', async () => {
    const c = new MockCM().reply(
      { body: entry('a-1') },
      { body: { certificateMapEntries: [entry('a-1')], nextPageToken: 'n' } },
      { body: { certificateMapEntries: [entry('a-1')], nextPageToken: 'n' } },
      { body: { certificateMapEntries: [entry('b-1')] } },
      { body: operation() },
    );
    const got = await c.getCertificateMapEntry('a-1');
    asserts.assertEquals(got.hostname, 'go.example.com');
    asserts.assertEquals(got.state, 'PENDING');

    const page = await c.listCertificateMapEntries({ pageSize: 1 });
    asserts.assertEquals(page.certificateMapEntries.length, 1);
    asserts.assertEquals(page.nextPageToken, 'n');
    asserts.assertEquals(c.last().url.pathname, ENTRIES);

    const all = [];
    for await (const e of c.iterateCertificateMapEntries()) all.push(e);
    asserts.assertEquals(all.length, 2);

    await c.deleteCertificateMapEntry('a-1');
    asserts.assertEquals(c.last().method, 'DELETE');
    asserts.assertEquals(c.last().url.pathname, `${ENTRIES}/a-1`);
  });

  it('normalises an empty entries page', async () => {
    const c = new MockCM().reply({ body: {} });
    asserts.assertEquals(await c.listCertificateMapEntries(), {
      certificateMapEntries: [],
      unreachable: [],
    });
  });
});

describe('GoogleCertificateManager — operations', () => {
  it('reads an operation by full name or bare id', async () => {
    const c = new MockCM().reply(
      { body: operation() },
      { body: operation() },
    );
    await c.getOperation(OP_NAME);
    asserts.assertEquals(c.last().url.pathname, `/v1/${OP_NAME}`);
    await c.getOperation('operation-1');
    asserts.assertEquals(c.last().url.pathname, `/v1/${OP_NAME}`);
  });

  it('rejects a malformed operation name', async () => {
    const c = new MockCM();
    for (
      const name of [
        '',
        'projects/p/locations/global/operations/../../certificates/x',
        'projects/p/locations/global/certificates/x',
        'operation 1',
      ]
    ) {
      await rejects(() => c.getOperation(name), 'REQUEST_VALIDATION_ERROR');
    }
    asserts.assertEquals(c.requests.length, 0);
  });

  it('waits for an operation to finish', async () => {
    const c = new MockCM().reply(
      { body: operation() },
      {
        body: operation({
          done: true,
          response: certificate('a-1'),
        }),
      },
    );
    const done = await c.waitForOperation(operation(), {
      intervalSeconds: 0.001,
    });
    asserts.assertEquals(done.done, true);
    asserts.assertEquals(
      (done.response as { name?: string }).name,
      certificate('a-1').name,
    );
    asserts.assertEquals(c.requests.length, 2);
  });

  it('accepts an operation name and settles a done operation without a request', async () => {
    const c = new MockCM().reply({ body: operation({ done: true }) });
    await c.waitForOperation(OP_NAME, { intervalSeconds: 0.001 });
    asserts.assertEquals(c.requests.length, 1);
    await c.waitForOperation(operation({ done: true }));
    asserts.assertEquals(c.requests.length, 1);
  });

  it('maps a failed operation onto the synchronous error codes', async () => {
    const cases: [number, string, boolean][] = [
      [6, 'ALREADY_EXISTS', false],
      [5, 'NOT_FOUND', false],
      [7, 'PERMISSION_DENIED', false],
      [9, 'FAILED_PRECONDITION', false],
      [3, 'INVALID_REQUEST', false],
      [8, 'QUOTA_EXCEEDED', false],
      [10, 'CONFLICT', true],
      [14, 'SERVICE_UNAVAILABLE', true],
      [13, 'SERVICE_UNAVAILABLE', true],
      [1, 'UNKNOWN_ERROR', false],
      [99, 'UNKNOWN_ERROR', false],
    ];
    const c = new MockCM();
    for (const [code, expected, transient] of cases) {
      const err = await rejects(
        () =>
          c.waitForOperation(
            operation({ done: true, error: { code, message: 'nope' } }),
          ),
        expected,
      );
      asserts.assertEquals(err.transient, transient, expected);
      asserts.assertEquals(err.getContextValue('operation'), OP_NAME);
      asserts.assertEquals(err.getContextValue('vendorCode'), code);
    }
    const err = await rejects(
      () =>
        c.waitForOperation(
          operation({ done: true, error: { code: 6, message: 'exists' } }),
        ),
      'ALREADY_EXISTS',
    );
    asserts.assertEquals(err.getContextValue('vendorStatus'), 'ALREADY_EXISTS');
  });

  it('throws a transient OPERATION_TIMEOUT at the deadline', async () => {
    const c = new MockCM().reply(
      ...Array.from({ length: 50 }, () => ({ body: operation() })),
    );
    const err = await rejects(
      () =>
        c.waitForOperation(operation(), {
          timeoutSeconds: 0.05,
          intervalSeconds: 0.01,
        }),
      'OPERATION_TIMEOUT',
    );
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('operation'), OP_NAME);
    asserts.assert(c.requests.length >= 1);
  });

  it('validates wait options', async () => {
    const c = new MockCM();
    const bad: unknown[] = [
      [operation(), { timeoutSeconds: 0 }],
      [operation(), { intervalSeconds: -1 }],
      [operation(), { timeoutSeconds: Number.NaN }],
      [{ done: false }, {}],
      ['projects/x', {}],
    ];
    for (const [op, options] of bad as [never, never][]) {
      await rejects(
        () => c.waitForOperation(op, options),
        'REQUEST_VALIDATION_ERROR',
      );
    }
    asserts.assertEquals(c.requests.length, 0);
  });

  it('propagates a failed poll unchanged', async () => {
    const c = new MockCM().reply({
      status: 404,
      body: googleError(404, 'NOT_FOUND', 'Operation not found'),
    });
    await rejects(() => c.waitForOperation(OP_NAME), 'NOT_FOUND');
  });
});

describe('GoogleCertificateManager — error mapping', () => {
  const cases: [number, unknown, string, boolean][] = [
    [
      400,
      googleError(400, 'INVALID_ARGUMENT', 'bad'),
      'INVALID_REQUEST',
      false,
    ],
    [
      400,
      googleError(400, 'FAILED_PRECONDITION', 'in use'),
      'FAILED_PRECONDITION',
      false,
    ],
    [401, googleError(401, 'UNAUTHENTICATED', 'expired'), 'AUTH_FAILED', false],
    [
      403,
      googleError(403, 'PERMISSION_DENIED', 'denied', 'SERVICE_DISABLED'),
      'PERMISSION_DENIED',
      false,
    ],
    [404, googleError(404, 'NOT_FOUND', 'gone'), 'NOT_FOUND', false],
    [409, googleError(409, 'ALREADY_EXISTS', 'dup'), 'ALREADY_EXISTS', false],
    [409, googleError(409, 'ABORTED', 'race'), 'CONFLICT', true],
    [
      429,
      googleError(429, 'RESOURCE_EXHAUSTED', 'slow', 'RATE_LIMIT_EXCEEDED'),
      'RATE_LIMITED',
      true,
    ],
    [
      429,
      googleError(429, 'RESOURCE_EXHAUSTED', 'quota'),
      'QUOTA_EXCEEDED',
      false,
    ],
    [500, googleError(500, 'INTERNAL', 'boom'), 'SERVICE_UNAVAILABLE', true],
    [503, googleError(503, 'UNAVAILABLE', 'down'), 'SERVICE_UNAVAILABLE', true],
    // No envelope: fall back to the HTTP status.
    [400, 'oops', 'INVALID_REQUEST', false],
    [401, null, 'AUTH_FAILED', false],
    [403, null, 'PERMISSION_DENIED', false],
    [404, null, 'NOT_FOUND', false],
    [409, null, 'CONFLICT', true],
    [418, null, 'INVALID_REQUEST', false],
    [429, null, 'RATE_LIMITED', true],
    [502, '<html>Bad Gateway</html>', 'SERVICE_UNAVAILABLE', true],
  ];

  for (const [status, body, code, transient] of cases) {
    it(`maps HTTP ${status} ${JSON.stringify(body)?.slice(0, 50)} to ${code}`, async () => {
      const c = new MockCM().reply({
        status,
        body: body ?? undefined,
        headers: typeof body === 'string'
          ? { 'content-type': 'text/html' }
          : { 'content-type': 'application/json' },
      });
      const err = await rejects(() => c.getCertificate('a-1'), code);
      asserts.assertEquals(err.transient, transient);
      asserts.assertEquals(err.getContextValue('status'), status);
    });
  }

  it('keeps the vendor detail, status and reason in context', async () => {
    const c = new MockCM().reply({
      status: 403,
      body: googleError(
        403,
        'PERMISSION_DENIED',
        'Certificate Manager API has not been used in project 123',
        'SERVICE_DISABLED',
      ),
    });
    const err = await rejects(
      () => c.getCertificate('a-1'),
      'PERMISSION_DENIED',
    );
    asserts.assertStringIncludes(err.message, 'has not been used');
    asserts.assertEquals(
      err.getContextValue('vendorStatus'),
      'PERMISSION_DENIED',
    );
    asserts.assertEquals(
      err.getContextValue('vendorReason'),
      'SERVICE_DISABLED',
    );
  });

  it('treats a RESOURCE_EXHAUSTED with a Retry-After hint as a rate limit', async () => {
    const c = new MockCM().reply({
      status: 429,
      body: googleError(429, 'RESOURCE_EXHAUSTED', 'slow down'),
      headers: { 'content-type': 'application/json', 'retry-after': '7' },
    });
    const err = await rejects(() => c.getCertificate('a-1'), 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 7);
  });

  it('maps a network failure to transient NETWORK_ERROR', async () => {
    const c = new MockCM().reply(() =>
      Promise.reject(new TypeError('error sending request'))
    );
    const err = await rejects(() => c.getCertificate('a-1'), 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
  });

  it('maps a request timeout to transient TIMEOUT', async () => {
    const c = new MockCM({ timeout: 1 });
    // RESTler aborts through the signal; the never-settling fake stands in
    // for a slow server.
    c['_fetch'] = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
        );
      });
    const err = await rejects(() => c.getCertificate('a-1'), 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1);
  });
});

describe('GoogleCertificateManager — maxRetryWait (RESTler rate-limit retry)', () => {
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockCM({ maxRetryWait });
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

  it('retries once after the hint, then surfaces RATE_LIMITED with retried: true', async () => {
    const { c, slept, calls } = throttled(60, '1');
    const err = await rejects(() => c.getCertificate('a-1'), 'RATE_LIMITED');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws RATE_LIMITED at once when the hint exceeds maxRetryWait', async () => {
    const { c, slept, calls } = throttled(5, '120');
    const err = await rejects(() => c.getCertificate('a-1'), 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

// ---------------------------------------------------------------------------
// Live tests — gated on a service account and project. The read-only test
// needs nothing else. The create/delete test also needs
// CONNECTOR_GOOGLE_CERTIFICATE_MANAGER_TEST_HOSTNAME, a hostname you control
// that does NOT point at a load balancer: the certificate stays
// PROVISIONING and is deleted in a `finally`, so nothing is ever issued or
// served. No map entry is created, so no live map is touched.
// ---------------------------------------------------------------------------
const env = envArgs();
const credentials = {
  clientEmail: env.get('CONNECTOR_GOOGLE_CERTIFICATE_MANAGER_CLIENT_EMAIL'),
  privateKey: env.get('CONNECTOR_GOOGLE_CERTIFICATE_MANAGER_PRIVATE_KEY'),
  projectId: env.get('CONNECTOR_GOOGLE_CERTIFICATE_MANAGER_PROJECT_ID'),
};
const testHostname = env.get(
  'CONNECTOR_GOOGLE_CERTIFICATE_MANAGER_TEST_HOSTNAME',
);
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'GoogleCertificateManager — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    const live = () =>
      new GoogleCertificateManager({
        auth: {
          type: 'CUSTOM',
          clientEmail: credentials.clientEmail!,
          privateKey: credentials.privateKey!.replace(/\\n/g, '\n'),
        },
        projectId: credentials.projectId!,
      });

    it('lists certificates and reports a missing one as NOT_FOUND', async () => {
      const client = live();
      const page = await client.listCertificates({ pageSize: 5 });
      asserts.assert(Array.isArray(page.certificates));
      await rejects(
        () => client.getCertificate('tundra-connect-does-not-exist'),
        'NOT_FOUND',
      );
    });

    it({
      name: 'creates, reads and deletes a managed certificate',
      ignore: !testHostname,
      fn: async () => {
        const client = live();
        const id = hostnameToResourceId(testHostname!, {
          prefix: `tc${Date.now().toString(36)}`,
        });
        await client.waitForOperation(
          await client.createCertificate({
            certificateId: id,
            domains: [testHostname!],
            labels: { purpose: 'tundra-connect-live-test' },
          }),
          { timeoutSeconds: 60 },
        );
        try {
          const cert = await client.getCertificate(id);
          asserts.assertEquals(cert.managed?.domains, [testHostname!]);
          await rejects(
            () =>
              client.createCertificate({
                certificateId: id,
                domains: [testHostname!],
              }),
            'ALREADY_EXISTS',
          );
        } finally {
          await client.waitForOperation(await client.deleteCertificate(id), {
            timeoutSeconds: 60,
          });
        }
      },
    });
  },
});
