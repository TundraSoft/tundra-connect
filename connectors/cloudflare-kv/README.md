# CloudflareKV

Typed Cloudflare Workers KV REST client for Deno, Bun, Node.js and
Cloudflare Workers: read and write KV from **outside** a Worker — a backend
on another cloud, a CLI, a CI job. Namespaces, cursor-paged key listings,
values as text, JSON or bytes with metadata and expiry, and the bulk write,
delete and read endpoints, split automatically to fit Cloudflare's
per-request limits. Every documented KV limit is checked before sending,
transient failures are retried with back-off, and every failure is one
typed error.

[![JSR](https://jsr.io/badges/@tundraconnect/cloudflare-kv)](https://jsr.io/@tundraconnect/cloudflare-kv)
[![JSR Score](https://jsr.io/badges/@tundraconnect/cloudflare-kv/score)](https://jsr.io/@tundraconnect/cloudflare-kv)

## Overview

Inside a Worker you use the KV binding. Outside one, the only way in is the
`client/v4` REST API under
`/accounts/{account_id}/storage/kv/namespaces`. This connect wraps all of
it:

- **Namespaces:** `listNamespaces` (paged), `iterateNamespaces`,
  `createNamespace`, `getNamespace`, `renameNamespace`, `deleteNamespace`.
- **Keys:** `listKeys` (prefix, limit 10–1000, cursor) and `iterateKeys`,
  an async iterator that follows the cursor for you.
- **Values:** `get` (text, JSON or bytes — a missing key is `null`, not an
  error), `getMetadata`, `put` (text or binary, with metadata and
  `expiration` / `expiration_ttl`), `putJson`, `delete`.
- **Bulk:** `bulkPut` (10,000 pairs and 100 MB per request), `bulkDelete`
  (10,000 keys per request) and `bulkGet` (100 keys per request). Larger
  calls are split into as many requests as needed and the results merged.
- Every key and value method targets the client's `namespaceId` unless the
  call passes its own.

```ts
import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
import { CloudflareKVError } from '@tundraconnect/cloudflare-kv/errors';

const kv = new CloudflareKV({
  auth: { type: 'BEARER', token: 'YOUR_API_TOKEN' },
  accountId: 'YOUR_ACCOUNT_ID',
  namespaceId: 'YOUR_NAMESPACE_ID',
});

try {
  await kv.put('r:acme', 'https://acme.example', {
    metadata: { owner: 'acme' },
    expiration_ttl: 86_400,
  });
  const target = await kv.get('r:acme'); // 'https://acme.example', or null
  console.log(target);
} catch (err) {
  if (err instanceof CloudflareKVError && err.code === 'VALUE_TOO_LARGE') {
    // over 25 MiB — nothing was sent
  } else {
    throw err;
  }
}
```

```ts continued
// Publish many at once: split into requests of ≤ 10,000 pairs / 100 MB.
const written = await kv.bulkPut([
  { key: 'r:beta', value: 'https://beta.example' },
  { key: 'img:logo', value: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
]);
console.log(written.successful_key_count, written.unsuccessful_keys);

// Read many at once: split into requests of ≤ 100 keys; missing keys are null.
const targets = await kv.bulkGet(['r:acme', 'r:beta', 'r:gone']);
console.log(targets['r:gone']); // null

// Walk every key under a prefix, then delete them.
const names: string[] = [];
for await (const key of kv.iterateKeys({ prefix: 'r:' })) names.push(key.name);
await kv.bulkDelete(names);

// JSON and bytes.
await kv.putJson('cfg:acme', { code: 301 });
const cfg = await kv.get<{ code: number }>('cfg:acme', { type: 'json' });
const logo = await kv.get('img:logo', { type: 'bytes' });
console.log(cfg?.code, logo?.byteLength);
```

## Endpoints

| Method                                    | Request                                         |
| ----------------------------------------- | ----------------------------------------------- |
| `listNamespaces({ page?, per_page?, … })` | `GET /storage/kv/namespaces`                    |
| `iterateNamespaces({ per_page?, … })`     | `GET /storage/kv/namespaces`, page after page   |
| `createNamespace(title)`                  | `POST /storage/kv/namespaces`                   |
| `getNamespace()`                          | `GET /storage/kv/namespaces/{id}`               |
| `renameNamespace(title)`                  | `PUT /storage/kv/namespaces/{id}`               |
| `deleteNamespace()`                       | `DELETE /storage/kv/namespaces/{id}`            |
| `listKeys({ prefix?, limit?, cursor? })`  | `GET …/{id}/keys`                               |
| `iterateKeys({ prefix?, limit? })`        | `GET …/{id}/keys`, cursor after cursor          |
| `get(key, { type? })`                     | `GET …/{id}/values/{key}`                       |
| `getMetadata(key)`                        | `GET …/{id}/metadata/{key}`                     |
| `put(key, value, { metadata?, … })`       | `PUT …/{id}/values/{key}` (raw or multipart)    |
| `putJson(key, value, { metadata?, … })`   | `PUT …/{id}/values/{key}`                       |
| `delete(key)`                             | `DELETE …/{id}/values/{key}`                    |
| `bulkPut(entries)`                        | `PUT …/{id}/bulk`, ≤ 10,000 pairs / 100 MB each |
| `bulkDelete(keys)`                        | `POST …/{id}/bulk/delete`, ≤ 10,000 keys each   |
| `bulkGet(keys, { type?, withMetadata? })` | `POST …/{id}/bulk/get`, ≤ 100 keys each         |

Every method also takes `timeout` (seconds, per request) and `retry` (a
policy, or `false`); key, value and bulk methods take `namespaceId`. Keys
are percent-encoded into the path, so a key containing `/`, `?`, `%` or
`../` stays one key.

**Not covered:** KV analytics (Cloudflare serves it from the GraphQL
Analytics API, not this REST API), and the deprecated `DELETE /bulk` form of
bulk delete.

## Limits, checked before sending

| Limit                              | Error when broken                         |
| ---------------------------------- | ----------------------------------------- |
| Key ≤ 512 bytes, not `.` or `..`   | `KEY_TOO_LONG` / `KEY_INVALID`            |
| Value ≤ 25 MiB                     | `VALUE_TOO_LARGE`                         |
| Metadata ≤ 1024 bytes serialized   | `METADATA_TOO_LARGE` / `METADATA_INVALID` |
| `expiration_ttl` ≥ 60, whole secs  | `EXPIRATION_INVALID`                      |
| `expiration` _or_ `expiration_ttl` | `EXPIRATION_INVALID`                      |
| Bulk ≤ 10,000 / 100 MB / 100 keys  | none — split for you                      |

A bulk call validates every entry before the first request, so one bad pair
fails the call without writing anything. If a later request of a split call
fails, the error's `bulk` context says how far it got.

## Retries

Transient failures — 429, 5xx, network errors and timeouts — are retried
up to 3 times by default. A `Retry-After` hint is waited out exactly (up
to `maxRetryAfterSeconds`, 60 by default); otherwise the wait is
exponential back-off with jitter from `baseDelayMs` (500) up to
`maxDelayMs` (30,000). `createNamespace` is retried only after a 429, since
a 5xx or timeout may have created it already.

```ts continued
const patient = new CloudflareKV({
  auth: { type: 'BEARER', token: 'YOUR_API_TOKEN' },
  accountId: 'YOUR_ACCOUNT_ID',
  namespaceId: 'YOUR_NAMESPACE_ID',
  retry: { retries: 5, baseDelayMs: 1_000, maxRetryAfterSeconds: 120 },
});
await patient.delete('r:acme', { retry: false }); // this call: no retries
```

A 429 that outlasts the retries surfaces as `CloudflareKVRateLimitError`
(a `CloudflareKVError` with `code: 'RATE_LIMITED'`) carrying
`retryAfterSeconds`. Workers KV also allows only one write per second to
the same key.

## Credentials

Create an API token at
[dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
with **Account → Workers KV Storage → Edit** (Read is enough for the read
methods), and find the account id on the dashboard's account home page. A
token that authenticates but lacks the permission fails as `FORBIDDEN`
rather than `AUTH_FAILED`.

The legacy account email plus Global API Key also works —
`auth: { type: 'CUSTOM', email, key }`, sent as `X-Auth-Email` /
`X-Auth-Key` — but it can do anything your user can, so prefer a token.

## Consistency

Workers KV is eventually consistent at the edge: a write made here is
visible to `get` here at once (it reads Cloudflare's central store), but a
Worker reading the same key elsewhere may see the old value for up to 60
seconds.

## Custom transport

To route requests through your own transport (a test double, a tracing
wrapper), subclass the client and reassign the protected `_fetch`:

```ts
import {
  CloudflareKV,
  type CloudflareKVOptions,
} from '@tundraconnect/cloudflare-kv';

class RoutedKV extends CloudflareKV {
  constructor(options: CloudflareKVOptions, transport: typeof fetch) {
    super(options);
    this._fetch = transport;
  }
}
```

## Testing your code

Your tests don't need to fake HTTP. Have your code take a `CloudflareKV`
instance and pass in a stand-in that returns the shapes from
`@tundraconnect/cloudflare-kv/schemas` or throws a real `CloudflareKVError`:

```ts
import { CloudflareKVError } from '@tundraconnect/cloudflare-kv/errors';

const outage = new CloudflareKVError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(outage.code, outage.transient);
```

To exercise the client itself against a fake transport, subclass it and
reassign the protected `_fetch` (see Custom transport above).

## Documentation

| Topic                                                                             | Description                                |
| --------------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/CloudflareKV-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/CloudflareKV-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/CloudflareKV-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [Workers KV REST API reference](https://developers.cloudflare.com/api/resources/kv/)
- [Workers KV limits](https://developers.cloudflare.com/kv/platform/limits/)
- [How KV works (consistency)](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/cloudflare-kv
```

**Bun:**

```sh
bunx jsr add @tundraconnect/cloudflare-kv
```

**Node.js:**

```sh
npx jsr add @tundraconnect/cloudflare-kv
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
