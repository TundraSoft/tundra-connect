# CloudflareKV API

Client configuration and endpoint methods for `@tundraconnect/cloudflare-kv`.

## Configuration

```ts
import { CloudflareKV } from '@tundraconnect/cloudflare-kv';

const kv = new CloudflareKV({
  auth: { type: 'BEARER', token: 'YOUR_API_TOKEN' },
  accountId: 'YOUR_ACCOUNT_ID',
  namespaceId: 'YOUR_NAMESPACE_ID',
});
```

| Option        | Type                                | Required | Default                                | Description                                                                                 |
| ------------- | ----------------------------------- | -------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `auth`        | `CloudflareKVAuth`                  | yes      | —                                      | `{ type: 'BEARER', token, prefix? }`, or the legacy `{ type: 'CUSTOM', email, key }`.       |
| `accountId`   | `string`                            | yes      | —                                      | The account that owns the namespaces.                                                       |
| `namespaceId` | `string`                            | no       | —                                      | Default namespace for key, value and bulk methods; a call's own `namespaceId` overrides it. |
| `retry`       | `CloudflareKVRetryOptions \| false` | no       | 3 retries, 500 ms → 30 s, ≤ 60 s hint  | Retry policy for 429 / 5xx / network / timeout, or `false` for none.                        |
| `timeout`     | `number`                            | no       | `30`                                   | Per-request timeout in seconds (1–120).                                                     |
| `baseURL`     | `string`                            | no       | `https://api.cloudflare.com/client/v4` | Override for a proxy or a test double.                                                      |

`auth` missing or incomplete &rarr; `CONFIG_INVALID_AUTH`. A missing, blank
or malformed `accountId` &rarr; `CONFIG_INVALID_ACCOUNT_ID`; the same for a
given `namespaceId` &rarr; `CONFIG_INVALID_NAMESPACE_ID`. A bad `retry`, or
RESTler's own `maxRetryWait` / `defaultRetryWait` (which `retry` replaces)
&rarr; `CONFIG_INVALID_RETRY`. Ids are at most 32 letters, digits, `-` or
`_`.

### Retry policy

| Field                  | Default | Meaning                                                                |
| ---------------------- | ------- | ---------------------------------------------------------------------- |
| `retries`              | `3`     | Retries after the first attempt, 0–10.                                 |
| `baseDelayMs`          | `500`   | First back-off delay; doubles every retry (with jitter: half to full). |
| `maxDelayMs`           | `30000` | Cap for one back-off delay.                                            |
| `maxRetryAfterSeconds` | `60`    | Longest `Retry-After` waited out; a longer hint ends the retries.      |

A `Retry-After` header (on a 429 or a 5xx) is waited out exactly instead of
the back-off. `createNamespace` is retried only after a 429.

### Per-call options

Every method accepts `timeout` and `retry`, overriding the client's for that
call. Key, value and bulk methods also accept `namespaceId`. With no
namespace id from either place they throw `REQUEST_VALIDATION_ERROR`.

### Getters

| Getter        | Type                  | Description                             |
| ------------- | --------------------- | --------------------------------------- |
| `vendor`      | `string`              | Always `'CloudflareKV'`.                |
| `accountId`   | `string`              | The client's account id.                |
| `namespaceId` | `string \| undefined` | The client's default namespace, if any. |

## Results

Cloudflare wraps JSON responses in `{ success, errors, messages, result }`.
Methods resolve to the unwrapped `result`; `listNamespaces` and `listKeys`
resolve to `{ result, result_info }`. A value read (`get`) is the raw
stored bytes, never parsed as an envelope.

## Namespaces

### `listNamespaces({ page?, per_page?, order?, direction? })`

`GET /accounts/{account_id}/storage/kv/namespaces` &rarr;
`NamespacePageSchema`. `per_page` is 1–1000; `order` is `id` or `title`.

### `iterateNamespaces({ page?, per_page?, order?, direction? })`

An async iterator over every namespace, requesting the next page as the loop
consumes the last.

### `createNamespace(title)`

`POST …/namespaces` with `{ title }` &rarr; `NamespaceSchema`. A title
already in use is refused by Cloudflare as `INVALID_REQUEST`.

### `getNamespace()`, `renameNamespace(title)`, `deleteNamespace()`

`GET`, `PUT` (`{ title }`) and `DELETE` on `…/namespaces/{namespace_id}`.
`deleteNamespace` removes every key in it and cannot be undone.

## Keys

### `listKeys({ prefix?, limit?, cursor? })`

`GET …/{namespace_id}/keys` &rarr; `KeyPageSchema`: names in lexicographic
order with `expiration` and `metadata` when set. `limit` is 10–1000. Pass
`result_info.cursor` as the next call's `cursor`; an empty or absent cursor
means the last page.

### `iterateKeys({ prefix?, limit?, cursor? })`

An async iterator over every matching key, following the cursor. It throws
`RESPONSE_ERROR` rather than loop if Cloudflare hands back the cursor it
was given.

```ts
import { CloudflareKV } from '@tundraconnect/cloudflare-kv';

declare const kv: CloudflareKV;

for await (const key of kv.iterateKeys({ prefix: 'r:', limit: 1000 })) {
  console.log(key.name, key.expiration, key.metadata);
}
```

## Values

### `get(key, { type? })`

`GET …/{namespace_id}/values/{key}`. `type` is `text` (default, a string),
`json` (parsed; `RESPONSE_ERROR` if the stored value is not JSON) or
`bytes` (a `Uint8Array`). A key that does not exist resolves to `null`.

Workers KV answers a missing key and an unknown namespace with the same
code (10009). The client tells them apart by the message: a "namespace"
message is `NOT_FOUND`; anything else on a 404 is a missing key.

### `getMetadata(key)`

`GET …/{namespace_id}/metadata/{key}` &rarr; `{ metadata }` (`null` for a
key written without any), or `null` when the key does not exist.

### `put(key, value, { metadata?, expiration?, expiration_ttl? })`

`PUT …/{namespace_id}/values/{key}`. `value` is a string (stored as UTF-8),
`ArrayBuffer`, typed array or `Blob`. Without `metadata` the body is the
raw value (`application/octet-stream`); with it, `multipart/form-data` with
a `value` part and a JSON `metadata` part. `expiration` (UNIX seconds) or
`expiration_ttl` (seconds, ≥ 60) go in the query string; give at most one.

### `putJson(key, value, options?)`

`put` with `JSON.stringify(value)`; `REQUEST_VALIDATION_ERROR` if it does
not serialize.

### `delete(key)`

`DELETE …/{namespace_id}/values/{key}`. Deleting a missing key succeeds.

## Bulk

### `bulkPut(entries)`

`PUT …/{namespace_id}/bulk`, each entry
`{ key, value, base64?, expiration?, expiration_ttl?, metadata? }`. A
string `value` is sent as given (base64-decoded by Cloudflare when
`base64: true`); binary is base64-encoded for you. Split into requests of at
most 10,000 pairs and 100 MB; resolves to
`{ successful_key_count, unsuccessful_keys }` summed across them.

### `bulkDelete(keys)`

`POST …/{namespace_id}/bulk/delete` with the key array, split into requests
of at most 10,000 keys; resolves like `bulkPut`.

### `bulkGet(keys, { type?, withMetadata? })`

`POST …/{namespace_id}/bulk/get` with `{ keys, type, withMetadata }`, split
into requests of at most 100 keys and merged. Resolves to values by key
(`null` for a missing key) or, with `withMetadata: true`, to
`{ value, metadata, expiration? }` by key. Text and JSON only — Cloudflare
does not return binary values in bulk.

### Partial failure

A split bulk call sends its requests one after another. If one fails, the
error carries `bulk: { requestsCompleted, requestsTotal, keysCompleted }` —
the first `keysCompleted` entries were applied.

```ts
import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
import { CloudflareKVError } from '@tundraconnect/cloudflare-kv/errors';

declare const kv: CloudflareKV;
declare const entries: { key: string; value: string }[];

try {
  await kv.bulkPut(entries);
} catch (err) {
  if (err instanceof CloudflareKVError) {
    console.log(err.getContextValue('bulk'));
  }
  throw err;
}
```

## Limits

Exported constants: `MAX_KEY_BYTES` (512), `MAX_VALUE_BYTES` (26,214,400),
`MAX_METADATA_BYTES` (1024), `MIN_EXPIRATION_TTL` (60),
`MAX_BULK_WRITE_KEYS` (10,000), `MAX_BULK_WRITE_BYTES` (100,000,000),
`MAX_BULK_DELETE_KEYS` (10,000), `MAX_BULK_GET_KEYS` (100).

---

[← Back to CloudflareKV](../README.md)
