# URLhaus API

Client configuration and endpoint methods for `@tundraconnect/urlhaus`.

## Configuration

```ts
import { URLhaus } from '@tundraconnect/urlhaus';

const urlhaus = new URLhaus({
  auth: { type: 'CUSTOM', authKey: 'YOUR_AUTH_KEY' },
  timeout: 1.5,
});
```

| Option    | Type          | Required | Default                                  | Description                                                     |
| --------- | ------------- | -------- | ---------------------------------------- | --------------------------------------------------------------- |
| `auth`    | `URLhausAuth` | yes      | —                                        | `{ type: 'CUSTOM', authKey }`, sent as the `Auth-Key` header.   |
| `timeout` | `number`      | no       | `10`                                     | Default per-call deadline in seconds, 1–120, fractions allowed. |
| `baseURL` | `string`      | no       | `https://urlhaus-api.abuse.ch/{version}` | Override for a proxy or a test double.                          |
| `version` | `string`      | no       | `v1`                                     | Fills `{version}` in `baseURL`.                                 |

`auth` missing, not `CUSTOM`, or with a blank `authKey` &rarr;
`CONFIG_INVALID_AUTH` at construction. The `Auth-Key` header is marked
sensitive, so RESTler redacts it from `call`/`authFailure` event payloads
and from error contexts.

### Getters

| Getter   | Type     | Description         |
| -------- | -------- | ------------------- |
| `vendor` | `string` | Always `'URLhaus'`. |

## Results

Lookups never return raw `query_status`:

| `query_status` | `lookupUrl` / `lookupHost` | Other lookups            | Feeds     |
| -------------- | -------------------------- | ------------------------ | --------- |
| `ok`           | `{ listed: true, entry }`  | `{ found: true, entry }` | the array |
| `no_results`   | `{ listed: false }`        | `{ found: false }`       | `[]`      |
| anything else  | throws `URLhausError`      | throws `URLhausError`    | throws    |

Numeric values URLhaus sends as strings (`id`, `url_count`, `file_size`,
`response_size`, `takedown_time_seconds`) stay strings. `larted` is the
string `'true'` or `'false'`. Every `entry` field is optional: URLhaus's own
examples are inconsistent, and a missing cosmetic field must never turn a
listed URL into a `RESPONSE_ERROR`.

## Endpoints

Every method takes an optional `timeout` (seconds, 1–120, fractions
allowed) bounding the whole call.

### `lookupUrl({ url })`

`POST /v1/url/`, form `url=<url>` &rarr; `ListedResult<UrlEntrySchema>`.

```ts
const verdict = await urlhaus.lookupUrl({ url: 'http://example.com/x.exe' });
if (verdict.listed && verdict.entry.url_status === 'online') {
  // actively serving malware
}
```

`INVALID_URL` when URLhaus refuses the URL.

### `lookupUrlId({ id })`

`POST /v1/urlid/` &rarr; `FoundResult<UrlEntrySchema>`. `id` is a positive
integer, as a number or string. URLhaus's documentation names the form
field `id` in its parameter table but `urlid` in its example request. Both
are sent with the same value, so the call works whichever the server reads.

### `lookupHost({ host })`

`POST /v1/host/`, form `host=<host>` &rarr; `ListedResult<HostEntrySchema>`.
An IPv4 address, hostname or domain, case-insensitive. `INVALID_HOST` when
URLhaus refuses it. `blacklists` is absent for an IPv4 host.

### `lookupPayload({ md5_hash } | { sha256_hash })`

`POST /v1/payload/` &rarr; `FoundResult<PayloadEntrySchema>`. Exactly one
hash, validated locally as 32 or 64 hex characters. `INVALID_HASH` when
URLhaus refuses it.

### `lookupTag({ tag })` / `lookupSignature({ signature })`

`POST /v1/tag/` / `POST /v1/signature/` &rarr; `FoundResult<TagEntrySchema>`
/ `FoundResult<SignatureEntrySchema>`. Up to 1,000 URLs each.

### `recentUrls({ limit? })` / `recentPayloads({ limit? })`

`GET /v1/urls/recent/` / `GET /v1/payloads/recent/`, or
`…/recent/limit/<n>/` with a `limit` of 1–1000 &rarr; `RecentUrlSchema[]` /
`PayloadEntrySchema[]`. These cover the past three days, newest first, and
return at most 1,000 entries.

## Not wrapped

The sample download (`/v1/download/<sha256>/`), the hourly and daily
batches, and the bulk dumps on `urlhaus.abuse.ch/downloads/` (regenerated
every five minutes) are left out. Fetch those directly if you need them.

## Custom transport

Subclass and reassign the protected `_fetch`:

```ts
import { URLhaus, type URLhausOptions } from '@tundraconnect/urlhaus';

class RoutedURLhaus extends URLhaus {
  constructor(options: URLhausOptions, transport: typeof fetch) {
    super(options);
    this._fetch = transport;
  }
}
```

---

[← Back to URLhaus](../README.md)
