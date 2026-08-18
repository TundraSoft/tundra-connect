# Sentry Schemas

The `@tundraconnect/sentry/schemas` subpath exports Guardian validators and
inferred types. Every endpoint method validates its request options (when it
takes any) before sending, and validates the response body before resolving.

```ts
import {
  type ListIssuesRequestSchema,
  ListIssuesRequestSchemaObject,
} from '@tundraconnect/sentry/schemas';

const payload: unknown = { query: 'is:unresolved', sort: 'freq' };

const [error, request] = ListIssuesRequestSchemaObject.safeParse(payload);
if (error || !request) throw error;

const typedRequest: ListIssuesRequestSchema = request;
console.log(typedRequest.sort);
```

## Resource Schemas

| Schema                        | Purpose                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `ProjectSchemaObject`         | A Project resource (`listProjects()`)                              |
| `IssueSchemaObject`           | An Issue resource (`listIssues()`/`getIssue()`/`updateIssue()`)    |
| `IssueEventSchemaObject`      | An Event resource (`listIssueEvents()`)                            |
| `ReleaseSchemaObject`         | A Release resource (`createRelease()`)                             |
| `IssueProjectRefSchemaObject` | The small project reference embedded in an Issue's `project` field |
| `ErrorSchemaObject`           | Sentry's `{ detail, causes? }` error envelope (4xx responses)      |

## Request Schemas

| Schema                               | Endpoint                                             |
| ------------------------------------ | ---------------------------------------------------- |
| `ListProjectsRequestSchemaObject`    | `GET /organizations/{org}/projects/`                 |
| `ListIssuesRequestSchemaObject`      | `GET /organizations/{org}/issues/`                   |
| `UpdateIssueRequestSchemaObject`     | `PUT /organizations/{org}/issues/{issue_id}/`        |
| `ListIssueEventsRequestSchemaObject` | `GET /organizations/{org}/issues/{issue_id}/events/` |
| `CreateReleaseRequestSchemaObject`   | `POST /organizations/{org}/releases/`                |

`UpdateIssueRequestSchemaObject` enforces one cross-field rule Guardian's
per-field validators can't express on their own, via `.refine()`: at least
one field must be supplied. `CreateReleaseRequestSchemaObject.version`
similarly uses `.refine()` to reject `.`, `..`, and any value containing a
forward slash or whitespace/control characters, matching Sentry's documented
constraint.

## Paginated Response Schemas

`ListProjectsResponseSchemaObject`, `ListIssuesResponseSchemaObject`, and
`ListIssueEventsResponseSchemaObject` each validate `{ <items>, nextCursor?
}` — Sentry's actual HTTP response body is a bare JSON array, so the client
wraps it under `projects`/`issues`/`events` before this schema ever sees it.

`nextCursor` is Sentry's next-page cursor, extracted from the response's RFC
5988 `Link` header (see [API](Sentry-API.md#pagination)). Unlike a
body-embedded cursor (e.g. Twilio's `next_page_uri`), a `Link` header is
never visible to a Guardian schema — schemas only ever see the response
body — so `nextCursor` is computed by the client and merged into the object
handed to `.parse()`, rather than derived here via `.transform()`.

---

[← Back to Sentry](../README.md)
