# URLhaus

Typed URLhaus (abuse.ch) client for Deno, Bun, Node.js and Cloudflare
Workers: look up URLs, hosts, payload hashes, tags and malware signatures in
the URLhaus malware-URL database, and read its recent-URL and
recent-payload feeds. Lookups resolve to typed results under a hard per-call
deadline.

[![JSR](https://jsr.io/badges/@tundraconnect/urlhaus)](https://jsr.io/@tundraconnect/urlhaus)
[![JSR Score](https://jsr.io/badges/@tundraconnect/urlhaus/score)](https://jsr.io/@tundraconnect/urlhaus)

## Overview

URLhaus tracks URLs used to distribute malware. Its API reports outcomes in
a `query_status` field rather than through HTTP status, and this connect
turns that into types:

- `no_results` is an answer, not an error. `lookupUrl` / `lookupHost`
  resolve to `{ listed: false }`, and the payload, tag, signature and
  URL-id lookups resolve to `{ found: false }`.
- `ok` resolves to `{ listed: true, entry }` / `{ found: true, entry }`, with
  `entry` validated against the endpoint's schema.
- Every other status throws a `URLhausError` with a stable code:
  `invalid_url` → `INVALID_URL`, `invalid_host` → `INVALID_HOST`,
  `invalid_md5`/`invalid_sha256` → `INVALID_HASH`, `unknown_auth_key` →
  `AUTH_FAILED`.

Timeouts, network failures, 5xx and 429 also throw `URLhausError`s, flagged
`transient: true`, so "no verdict yet" can never be mistaken for "not
listed". The Auth-Key travels in the `Auth-Key` header and is redacted from
every RESTler event payload and error context.

```ts
import { URLhaus } from '@tundraconnect/urlhaus';
import { URLhausError } from '@tundraconnect/urlhaus/errors';

const urlhaus = new URLhaus({
  auth: { type: 'CUSTOM', authKey: 'YOUR_AUTH_KEY' },
  timeout: 1.5, // seconds, whole call; fractional is fine (min 1)
});

try {
  const verdict = await urlhaus.lookupUrl({ url: 'http://example.com/x.exe' });
  if (verdict.listed) {
    console.log(
      verdict.entry.url_status,
      verdict.entry.threat,
      verdict.entry.tags,
    );
  }
} catch (err) {
  if (err instanceof URLhausError && err.transient) {
    // TIMEOUT / NETWORK_ERROR / SERVICE_UNAVAILABLE / RATE_LIMITED: retry later
  } else {
    throw err;
  }
}
```

## Endpoints

| Method                           | Request                                   |
| -------------------------------- | ----------------------------------------- |
| `lookupUrl({ url })`             | `POST /v1/url/` &nbsp;`url=…`             |
| `lookupUrlId({ id })`            | `POST /v1/urlid/` &nbsp;`urlid=…&id=…`    |
| `lookupHost({ host })`           | `POST /v1/host/` &nbsp;`host=…`           |
| `lookupPayload({ md5_hash })`    | `POST /v1/payload/` &nbsp;`md5_hash=…`    |
| `lookupPayload({ sha256_hash })` | `POST /v1/payload/` &nbsp;`sha256_hash=…` |
| `lookupTag({ tag })`             | `POST /v1/tag/` &nbsp;`tag=…`             |
| `lookupSignature({ signature })` | `POST /v1/signature/` &nbsp;`signature=…` |
| `recentUrls({ limit? })`         | `GET /v1/urls/recent/[limit/<n>/]`        |
| `recentPayloads({ limit? })`     | `GET /v1/payloads/recent/[limit/<n>/]`    |

Every method also takes an optional per-call `timeout`. The bulk downloads
(the `text_*` / `csv_*` / `json_*` dumps, sample downloads and daily
batches) are not wrapped.

## Access and fair use

- **Auth-Key:** free from the
  [abuse.ch Authentication Portal](https://auth.abuse.ch/). URLhaus refuses
  a request without one (HTTP 401) and an unrecognized one (HTTP 403,
  `unknown_auth_key`). Both surface as `AUTH_FAILED`.
- **Fair use:** the API "is available free of charge under the fair use
  principles". abuse.ch's terms describe query volume limits as "volumes
  reasonably expected for non-commercial or non-profit purposes".
- **Commercial use:** "Use of the API by companies, networks, or individuals
  with commercial or for-profit needs may require a paid subscription for
  the enhanced abuse.ch commercial API." That subscription is managed by
  Spamhaus. The terms also describe a contributor route: a commercial user
  who contributes data consistently for six months may qualify for free use,
  subject to review. Read [abuse.ch's terms of use](https://abuse.ch/terms-of-use/)
  before relying on URLhaus in a commercial product.

## The deadline

`timeout` (on the client, or per call) is a **total** deadline in seconds:
it bounds the whole call, body read included, and accepts fractions down to
1 (`1.5`). Missing it throws `TIMEOUT`. It stays a total deadline as long as
RESTler's `maxRetryWait` is unset (the default).

## Custom transport

To route requests through your own transport (a test double, a tracing
wrapper), subclass the client and reassign the protected `_fetch`:

```ts
import { URLhaus, type URLhausOptions } from '@tundraconnect/urlhaus';

class RoutedURLhaus extends URLhaus {
  constructor(options: URLhausOptions, transport: typeof fetch) {
    super(options);
    this._fetch = transport;
  }
}
```

## Documentation

| Topic                                                                        | Description                                |
| ---------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/URLhaus-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/URLhaus-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/URLhaus-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [URLhaus API documentation](https://urlhaus-api.abuse.ch/)
- [abuse.ch Authentication Portal](https://auth.abuse.ch/)
- [abuse.ch terms of use](https://abuse.ch/terms-of-use/)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/urlhaus
```

**Bun:**

```sh
bunx jsr add @tundraconnect/urlhaus
```

**Node.js:**

```sh
npx jsr add @tundraconnect/urlhaus
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
