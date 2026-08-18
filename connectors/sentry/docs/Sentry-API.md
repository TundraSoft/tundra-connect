# Sentry API

## Configuration

```ts
import { Sentry } from '@tundraconnect/sentry';

const client = new Sentry({
  auth: { type: 'BEARER', token: 'sntrys_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
  organization: 'my-org',
});
```

`auth` is required and must be `{ type: 'BEARER', token, prefix? }` — both an
organization auth token (prefix `sntrys_`) and a legacy personal token work
identically as a Bearer token. `organization` is also required: it's the
organization slug (or numeric ID) every endpoint on this client is scoped to
(`GET|POST|PUT /organizations/{organization}/...`), so it's a constructor
option — like Twilio's `accountSid` — rather than repeated on every call.
Read it back via the `client.organization` getter. The client throws
`SentryError` (`CONFIG_INVALID_TOKEN`/`CONFIG_INVALID_ORGANIZATION`) at
construction if either is missing or malformed.

`auth.token` is sent as `Authorization: <prefix> <token>` on every request,
via RESTler's built-in Bearer auth support (no custom auth handling needed).
`baseURL` defaults to `https://sentry.io/api/0`; override it to talk to a
self-hosted or region instance — there's no dedicated option beyond the
normal `baseURL` every connect exposes. `timeout` is expressed in seconds
and defaults to `30`.

This connect covers Sentry's organization/project REST API
(`https://sentry.io/api/0/`) — not the DSN-based event-ingestion protocol
used to report new errors/exceptions into Sentry, which is a separate,
semi-binary envelope format architecturally foreign to this connect's
request/response client pattern.

## Endpoints

| Method              | Endpoint                                             | Result                                       |
| ------------------- | ---------------------------------------------------- | -------------------------------------------- |
| `listProjects()`    | `GET /organizations/{org}/projects/`                 | Paginated list of `{ projects, nextCursor }` |
| `listIssues()`      | `GET /organizations/{org}/issues/`                   | Paginated list of `{ issues, nextCursor }`   |
| `getIssue()`        | `GET /organizations/{org}/issues/{issue_id}/`        | A single `IssueSchema`                       |
| `updateIssue()`     | `PUT /organizations/{org}/issues/{issue_id}/`        | The updated `IssueSchema`                    |
| `listIssueEvents()` | `GET /organizations/{org}/issues/{issue_id}/events/` | Paginated list of `{ events, nextCursor }`   |
| `createRelease()`   | `POST /organizations/{org}/releases/`                | The created `ReleaseSchema`                  |

### `listProjects()` / `listIssues()` / `listIssueEvents()` — pagination

Sentry paginates with an RFC 5988 `Link` response header rather than a
page-number field:

```
Link: <url>; rel="previous"; results="false"; cursor="0:0:1",
      <url>; rel="next"; results="true"; cursor="0:100:0"
```

Each of these three methods parses that header internally and returns a
ready-to-use `nextCursor` alongside the page — `undefined` on the last page
— so callers never parse the header themselves:

```ts
let cursor: string | undefined;
do {
  const page = await client.listIssues({ query: 'is:unresolved', cursor });
  for (const issue of page.issues) console.log(issue.shortId, issue.title);
  cursor = page.nextCursor;
} while (cursor);
```

`listIssues()`'s `project`/`environment` filters accept an array — Sentry
documents them as repeatable (`?project=1&project=2`) — which the client
encodes as repeated query parameters.

### `getIssue()` / `updateIssue()`

```ts
const issue = await client.getIssue('PUMP-STATION-1');
console.log(issue.status);

const resolved = await client.updateIssue('PUMP-STATION-1', {
  status: 'resolved',
});
```

`issueId` accepts either the numeric issue ID or its short ID (e.g.
`PUMP-STATION-1`). `updateIssue()` requires at least one field in `options`
— an empty update is rejected locally rather than sent as a no-op request.

### `createRelease()`

```ts
const release = await client.createRelease({
  version: 'frontend@1.0.0',
  projects: ['frontend'],
  ref: 'abc123',
});
console.log(release.id);
```

`version` and `projects` are required; `version` may not be `.`/`..`, contain
a forward slash, or contain whitespace/control characters (Sentry's
documented constraint).

See [Errors](Sentry-Errors.md) for failure handling and
[Schemas](Sentry-Schemas.md) for request/response validation.

---

[← Back to Sentry](../README.md)
