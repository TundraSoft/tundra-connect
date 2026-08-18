import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { GuardianError } from '@guardian';
import { Sentry } from './Sentry.ts';
import { SentryError } from './errors/mod.ts';

const SECRET_TOKEN = 'sntrys_super-secret-value-that-must-not-leak';

class MockSentry extends Sentry {
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

function client(
  overrides: Partial<{ token: string; organization: string }> = {},
) {
  return new MockSentry({
    auth: { type: 'BEARER', token: overrides.token ?? SECRET_TOKEN },
    organization: overrides.organization ?? 'my-org',
  });
}

const validIssue = {
  id: '1',
  shortId: 'PUMP-STATION-1',
  title: 'Example exception',
  level: 'error',
  status: 'unresolved',
  isPublic: false,
  type: 'default',
  numComments: 0,
  isBookmarked: false,
  count: '1',
  userCount: 0,
  firstSeen: '2018-11-06T21:19:55Z',
  lastSeen: '2018-11-06T21:19:55Z',
  project: { id: '2', name: 'Pump Station', slug: 'pump-station' },
};

describe('Sentry', () => {
  it('constructs with the required auth and organization options', () => {
    const c = client();
    asserts.assertEquals(c.vendor, 'Sentry');
    asserts.assertEquals(c.organization, 'my-org');
  });

  it('trims a padded organization slug', () => {
    const c = client({ organization: '  my-org  ' });
    asserts.assertEquals(c.organization, 'my-org');
  });

  it('rejects a blank auth token', () => {
    asserts.assertThrows(
      () =>
        new MockSentry({
          auth: { type: 'BEARER', token: '' },
          organization: 'my-org',
        }),
      SentryError,
    );
  });

  it('rejects a completely missing auth', () => {
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => new MockSentry({ organization: 'my-org' } as any),
      SentryError,
    );
  });

  it('rejects an auth config that is not a Bearer token', () => {
    asserts.assertThrows(
      () =>
        // deno-lint-ignore no-explicit-any
        new MockSentry({
          auth: { type: 'BASIC', username: 'x', password: 'y' },
          organization: 'my-org',
        } as any),
      SentryError,
    );
  });

  it('rejects a blank organization', () => {
    asserts.assertThrows(
      () =>
        new MockSentry({
          auth: { type: 'BEARER', token: SECRET_TOKEN },
          organization: '   ',
        }),
      SentryError,
    );
  });

  it('rejects a completely missing organization', () => {
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () =>
        new MockSentry(
          { auth: { type: 'BEARER', token: SECRET_TOKEN } } as any,
        ),
      SentryError,
    );
  });

  it('never leaks the configured auth token into a thrown config error', () => {
    let caught: SentryError | undefined;
    try {
      new MockSentry({
        // `type: 'BASIC'` fails validation just like a blank/missing token
        // would, while still carrying a secret-looking value in `password`,
        // to prove it never surfaces on the thrown error.
        // deno-lint-ignore no-explicit-any
        auth: { type: 'BASIC', username: 'x', password: SECRET_TOKEN } as any,
        organization: 'my-org',
      });
    } catch (err) {
      caught = err as SentryError;
    }
    asserts.assertExists(caught);
    asserts.assertEquals(caught?.message.includes(SECRET_TOKEN), false);
    asserts.assertEquals(
      JSON.stringify(caught?.toJSON()).includes(SECRET_TOKEN),
      false,
    );
  });

  it('sends the configured token as a Bearer token', async () => {
    const c = client();
    c.setResponse(JSON.stringify([]), 200);

    await c.listProjects();

    const headers = c.request?.headers as Record<string, string>;
    asserts.assertEquals(headers['Authorization'], `BEARER ${SECRET_TOKEN}`);
    asserts.assertStringIncludes(
      c.request?.url ?? '',
      '/organizations/my-org/projects/',
    );
  });

  it('lists projects', async () => {
    const c = client();
    c.setResponse(
      JSON.stringify([
        {
          id: '2',
          slug: 'pump-station',
          name: 'Pump Station',
          dateCreated: '2018-11-06T21:19:55Z',
        },
      ]),
      200,
    );

    const page = await c.listProjects();
    asserts.assertEquals(page.projects.length, 1);
    asserts.assertEquals(page.projects[0]?.slug, 'pump-station');
    asserts.assertEquals(page.nextCursor, undefined);
    asserts.assertEquals(c.request?.method, 'GET');
  });

  it('extracts nextCursor from the Link response header when there is a next page', async () => {
    const c = client();
    c.setResponse(JSON.stringify([]), 200, {
      'content-type': 'application/json',
      link:
        '<https://sentry.io/api/0/organizations/my-org/projects/?cursor=0:0:1>; rel="previous"; results="false"; cursor="0:0:1", ' +
        '<https://sentry.io/api/0/organizations/my-org/projects/?cursor=0:100:0>; rel="next"; results="true"; cursor="0:100:0"',
    });

    const page = await c.listProjects();
    asserts.assertEquals(page.nextCursor, '0:100:0');
  });

  it('leaves nextCursor undefined when the Link header has no further results', async () => {
    const c = client();
    c.setResponse(JSON.stringify([]), 200, {
      'content-type': 'application/json',
      link:
        '<https://sentry.io/api/0/organizations/my-org/projects/?cursor=0:0:1>; rel="previous"; results="false"; cursor="0:0:1", ' +
        '<https://sentry.io/api/0/organizations/my-org/projects/?cursor=0:100:0>; rel="next"; results="false"; cursor="0:100:0"',
    });

    const page = await c.listProjects();
    asserts.assertEquals(page.nextCursor, undefined);
  });

  it('leaves nextCursor undefined when the Link header is absent entirely', async () => {
    const c = client();
    c.setResponse(JSON.stringify([]), 200);

    const page = await c.listProjects();
    asserts.assertEquals(page.nextCursor, undefined);
  });

  it('passes a cursor param through to the request query string', async () => {
    const c = client();
    c.setResponse(JSON.stringify([]), 200);

    await c.listProjects({ cursor: '0:100:0' });
    asserts.assertStringIncludes(c.request?.url ?? '', 'cursor=0%3A100%3A0');
  });

  it('lists issues, encoding a repeated project filter as multiple query params', async () => {
    const c = client();
    c.setResponse(JSON.stringify([validIssue]), 200);

    const page = await c.listIssues({
      project: ['1234', '5678'],
      query: 'is:unresolved',
      sort: 'freq',
    });
    asserts.assertEquals(page.issues.length, 1);
    asserts.assertEquals(page.issues[0]?.shortId, 'PUMP-STATION-1');
    const url = c.request?.url ?? '';
    asserts.assertStringIncludes(url, 'project=1234');
    asserts.assertStringIncludes(url, 'project=5678');
    asserts.assertStringIncludes(url, 'sort=freq');
  });

  it('gets a single issue', async () => {
    const c = client();
    c.setResponse(JSON.stringify(validIssue), 200);

    const issue = await c.getIssue('PUMP-STATION-1');
    asserts.assertEquals(issue.shortId, 'PUMP-STATION-1');
    asserts.assertStringIncludes(
      c.request?.url ?? '',
      '/organizations/my-org/issues/PUMP-STATION-1/',
    );
    asserts.assertEquals(c.request?.method, 'GET');
  });

  it('rejects a blank issueId before making a request', async () => {
    const c = client();
    c.setResponse(JSON.stringify(validIssue), 200);

    await asserts.assertRejects(() => c.getIssue('   '), SentryError);
    asserts.assertEquals(c.request, undefined);
  });

  it('updates an issue', async () => {
    const c = client();
    c.setResponse(JSON.stringify({ ...validIssue, status: 'resolved' }), 200);

    const issue = await c.updateIssue('PUMP-STATION-1', { status: 'resolved' });
    asserts.assertEquals(issue.status, 'resolved');
    asserts.assertEquals(c.request?.method, 'PUT');
    asserts.assertStringIncludes(
      c.request?.url ?? '',
      '/organizations/my-org/issues/PUMP-STATION-1/',
    );
  });

  it('rejects an update-issue call with no fields, via the async contract (assertRejects)', async () => {
    const c = client();
    // Stub the network so an unexpected real call would fail fast instead
    // of hanging, then confirm below it was never actually reached.
    c.setResponse(JSON.stringify(validIssue), 200);

    const error = await asserts.assertRejects(
      () => c.updateIssue('PUMP-STATION-1', {}),
      SentryError,
    );
    asserts.assertInstanceOf(error.cause, GuardianError);
    asserts.assertEquals(c.request, undefined);
  });

  it('lists issue events', async () => {
    const c = client();
    c.setResponse(
      JSON.stringify([{ id: 'abc123', dateCreated: '2018-11-06T21:19:55Z' }]),
      200,
    );

    const page = await c.listIssueEvents('PUMP-STATION-1', { full: true });
    asserts.assertEquals(page.events.length, 1);
    asserts.assertStringIncludes(
      c.request?.url ?? '',
      '/organizations/my-org/issues/PUMP-STATION-1/events/',
    );
    asserts.assertStringIncludes(c.request?.url ?? '', 'full=true');
  });

  it('creates a release', async () => {
    const c = client();
    c.setResponse(
      JSON.stringify({
        id: 1,
        version: 'frontend@1.0.0',
        status: 'open',
        dateCreated: '2024-01-01T00:00:00Z',
        commitCount: 0,
        projects: [{ id: 1, slug: 'frontend', name: 'frontend' }],
      }),
      201,
    );

    const release = await c.createRelease({
      version: 'frontend@1.0.0',
      projects: ['frontend'],
    });
    asserts.assertEquals(release.version, 'frontend@1.0.0');
    asserts.assertEquals(c.request?.method, 'POST');
    asserts.assertStringIncludes(
      c.request?.url ?? '',
      '/organizations/my-org/releases/',
    );
  });

  it('rejects a locally invalid create-release request before making a request', async () => {
    const c = client();
    c.setResponse(JSON.stringify({}), 201);

    const error = await asserts.assertRejects(
      () =>
        c.createRelease({
          // deno-lint-ignore no-explicit-any
          version: 'bad/version' as any,
          projects: ['frontend'],
        }),
      SentryError,
    );
    asserts.assertInstanceOf(error.cause, GuardianError);
    asserts.assertEquals(c.request, undefined);
  });

  it('raises RESPONSE_ERROR when a 200 issue body fails validation', async () => {
    const c = client();
    c.setResponse(JSON.stringify({ id: '1' }), 200);

    await asserts.assertRejects(
      () => c.getIssue('PUMP-STATION-1'),
      SentryError,
      'schema',
    );
  });

  it('maps a 429 to RATE_LIMITED with Sentry rate-limit header metadata', async () => {
    const c = client();
    c.setResponse(JSON.stringify({ detail: 'rate limited' }), 429, {
      'content-type': 'application/json',
      'x-sentry-rate-limit-limit': '40',
      'x-sentry-rate-limit-remaining': '0',
      'x-sentry-rate-limit-reset': '1700000000',
      'x-sentry-rate-limit-concurrentlimit': '5',
      'x-sentry-rate-limit-concurrentremaining': '0',
    });

    try {
      await c.listProjects();
      throw new Error('expected listProjects to reject');
    } catch (error) {
      asserts.assert(error instanceof SentryError);
      asserts.assertEquals(error.code, 'RATE_LIMITED');
      asserts.assertEquals(error.getContextValue('rateLimitLimit'), '40');
      asserts.assertEquals(error.getContextValue('rateLimitRemaining'), '0');
      asserts.assertEquals(
        error.getContextValue('rateLimitReset'),
        '1700000000',
      );
      asserts.assertEquals(
        error.getContextValue('rateLimitConcurrentLimit'),
        '5',
      );
      asserts.assertEquals(
        error.getContextValue('rateLimitConcurrentRemaining'),
        '0',
      );
      asserts.assertStringIncludes(error.message, '1700000000');
    }
  });

  it('maps every documented HTTP status to its connect-specific code', async () => {
    const cases: Array<{ status: number; code: string }> = [
      { status: 400, code: 'INVALID_REQUEST' },
      { status: 401, code: 'AUTH_FAILED' },
      { status: 403, code: 'FORBIDDEN' },
      { status: 404, code: 'NOT_FOUND' },
    ];

    for (const { status, code } of cases) {
      const c = client();
      c.setResponse(
        JSON.stringify({ detail: 'Vendor error.' }),
        status,
        { 'content-type': 'application/json' },
      );

      const error = await asserts.assertRejects(
        () => c.listProjects(),
        SentryError,
      );
      asserts.assertEquals(error.code, code);
      asserts.assertEquals(error.getContextValue('detail'), 'Vendor error.');
    }
  });

  it('falls back to SERVICE_UNAVAILABLE for an unparseable 5xx response', async () => {
    const c = client();
    c.setResponse('<html>Internal Server Error</html>', 500, {
      'content-type': 'text/html',
    });

    const error = await asserts.assertRejects(
      () => c.listProjects(),
      SentryError,
    );
    asserts.assertEquals(error.code, 'SERVICE_UNAVAILABLE');
  });

  it('falls back to UNKNOWN_ERROR for an unmapped status without a documented envelope', async () => {
    const c = client();
    c.setResponse('teapot', 418);

    const error = await asserts.assertRejects(
      () => c.listProjects(),
      SentryError,
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it("never leaks the configured token into a request-error's message or toJSON", async () => {
    const c = client({ token: SECRET_TOKEN });
    c.setResponse(JSON.stringify({ detail: 'Invalid token' }), 401);

    let caught: SentryError | undefined;
    try {
      await c.listProjects();
    } catch (err) {
      caught = err as SentryError;
    }
    asserts.assertExists(caught);
    asserts.assertEquals(caught?.message.includes(SECRET_TOKEN), false);
    asserts.assertEquals(
      JSON.stringify(caught?.toJSON()).includes(SECRET_TOKEN),
      false,
    );
  });
});

// =============================================================================
// Live tests — run only when real Sentry credentials are present in the
// environment. Skipped (not failed) otherwise, and on Bun/Node regardless of
// credentials — this suite is Deno-only.
// =============================================================================

const env = envArgs();
const credentials = {
  token: env.get('CONNECTOR_SENTRY_TOKEN'),
  organization: env.get('CONNECTOR_SENTRY_ORGANIZATION'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'Sentry — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('lists real projects, then real issues for the first project found', async () => {
      const client = new Sentry({
        auth: { type: 'BEARER', token: credentials.token! },
        organization: credentials.organization!,
      });

      const projectsPage = await client.listProjects();
      asserts.assertEquals(Array.isArray(projectsPage.projects), true);

      const firstProject = projectsPage.projects[0];
      if (!firstProject) {
        // Nothing further to check against an org with zero projects —
        // listIssues needs at least one project to scope to, and this
        // test can't safely assume one exists.
        return;
      }

      const issuesPage = await client.listIssues({
        project: [firstProject.slug],
      });
      asserts.assertEquals(Array.isArray(issuesPage.issues), true);

      // updateIssue, createRelease, getIssue, and listIssueEvents are
      // deliberately NOT exercised here: updateIssue/createRelease mutate
      // real triage state on a real org with no undo, and
      // getIssue/listIssueEvents need a pre-existing disposable issue id
      // this test can't safely assume exists.
    });
  },
});
