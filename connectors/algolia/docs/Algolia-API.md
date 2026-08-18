# Algolia API

## Configuration

```ts
import { Algolia } from '@tundraconnect/algolia';

const client = new Algolia({
  auth: {
    type: 'CUSTOM',
    applicationId: 'YOUR_APP_ID', // not secret — visible in client-side search widgets
    apiKey: 'YOUR_ADMIN_API_KEY', // secret — redacted from logs/events/errors
  },
});
```

| Option    | Type                                        | Default  | Description                                                              |
| --------- | ------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `auth`    | `{ type: 'CUSTOM', applicationId, apiKey }` | required | Algolia credentials. Both fields required — see below.                   |
| `baseURL` | `string`                                    | derived  | Write host, `https://{applicationId}.algolia.net`. Override for a proxy. |
| `timeout` | `number` (seconds)                          | `10`     | Per-request timeout, inherited from `RESTlerOptions`.                    |

`auth.applicationId` is your Algolia Application ID — not a secret, but
load-bearing: both base URLs this client talks to are derived from it (see
"Dual base URL" below). `auth.apiKey` is the credential (an Admin API key
for write operations, or a Search API key if you only need `search`/
`getObject`/`browseObjects`) — never logged or echoed into a thrown error's
context; see [Errors](Algolia-Errors.md).

Both fields are validated at construction: an empty/missing
`applicationId` throws `CONFIG_INVALID_APPLICATION_ID`, an empty/missing
`apiKey` throws `CONFIG_INVALID_API_KEY`, and a non-`CUSTOM` `auth.type`
throws `CONFIG_INVALID_AUTH`.

## Dual base URL

Unlike every other connect in this repo, Algolia genuinely uses **two**
different hostnames, both derived from `auth.applicationId`:

- **Write host** — `https://{applicationId}.algolia.net` — used by
  `saveObject`, `deleteObject`, and `waitTask` (task-status polling is a
  write-side concern).
- **Search/read host** — `https://{applicationId}-dsn.algolia.net` — a
  globally-distributed, latency-optimized cluster used by `search`,
  `getObject`, and `browseObjects`.

`RESTlerOptions.baseURL` (the client-level option) is a single fixed
value, set once at construction — that's all every other connect needs,
since no other vendor here splits reads and writes across two hosts.
`Algolia` sets it to the **write** host in its constructor, so every
method gets a working default for free. The **read** host is derived
on demand by a private getter and passed as `baseURL` on the per-request
`RESTlerEndpoint` object for the three read methods — `RESTlerEndpoint`
independently carries its own optional `baseURL`, which
`_processEndpoint` prefers over the instance option whenever it's present
(`endpoint.baseURL ?? this._getOption('baseURL')`). That per-request
override, already part of RESTler's request pipeline, is the entire
mechanism — no new plumbing was added to make it work.

```ts
// Inside Algolia.ts (illustrative, not the literal code)
super(options, { baseURL: `https://${applicationId}.algolia.net` }); // write host, instance default

private get __searchBaseURL(): string {
  return `https://${this.applicationId}-dsn.algolia.net`;
}

public async search(indexName: string, request: SearchRequestSchema) {
  return await this.__requestAndValidate(
    { baseURL: this.__searchBaseURL, path: `/1/indexes/${indexName}/query`, method: 'POST', payload: request },
    SearchResponseSchemaObject,
  );
}
```

## Endpoints

| Method                                  | Endpoint                                            | Host   | Result                       |
| --------------------------------------- | --------------------------------------------------- | ------ | ---------------------------- |
| `search(indexName, request)`            | `POST /1/indexes/{indexName}/query`                 | search | `SearchResponseSchema`       |
| `saveObject(indexName, object)`         | `POST /1/indexes/{indexName}`                       | write  | `SaveObjectResponseSchema`   |
| `getObject(indexName, objectID)`        | `GET /1/indexes/{indexName}/{objectID}`             | search | `AlgoliaObjectSchema`        |
| `deleteObject(indexName, objectID)`     | `DELETE /1/indexes/{indexName}/{objectID}`          | write  | `DeleteObjectResponseSchema` |
| `browseObjects(indexName, request?)`    | `POST /1/indexes/{indexName}/browse`                | search | `BrowseResponseSchema`       |
| `waitTask(indexName, taskID, options?)` | `GET /1/indexes/{indexName}/task/{taskID}` (polled) | write  | `TaskStatusSchema`           |

### `search` vs `browseObjects`

`search` is a relevance-ranked, paginated query (`page`/`hitsPerPage`),
meant for interactive search UIs. `browseObjects` is a cursor-based full
scan intended to export or iterate an entire index — unranked, and not
subject to search-relevance limits. Call `browseObjects` repeatedly,
passing the previous response's `cursor` back in the next request, until a
response omits `cursor`.

### `waitTask`

Saving or deleting an object is accepted synchronously but applied to the
index asynchronously — the response only confirms Algolia queued the
write. `waitTask` polls `GET /1/indexes/{indexName}/task/{taskID}` on a
fixed interval (`intervalMs`, default `1000`) up to a bounded total budget
(`timeoutMs`, default `10000`) and resolves once the vendor reports
`status: 'published'`, or throws `TASK_TIMEOUT` if the budget elapses
first. It is a finite, time-boxed loop — never an unbounded retry.

```ts
const saved = await client.saveObject('products', { name: 'Blue socks' });
await client.waitTask('products', saved.taskID, { timeoutMs: 30_000 });
// The index is now guaranteed to reflect the save.
```

See [Errors](Algolia-Errors.md) for failure handling and
[Schemas](Algolia-Schemas.md) for request/response validation.

---

[← Back to Algolia](../README.md)
