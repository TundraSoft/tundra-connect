# CloudflareDNS

Typed Cloudflare DNS client for Deno, Bun, Node.js and Cloudflare Workers:
list, create, update, replace, delete and batch-edit the DNS records of a
zone, export the zone as a BIND file, and look up zones by name to find a
zone id. Requests are validated locally, responses are unwrapped from
Cloudflare's envelope and validated, and every failure is one typed error.

[![JSR](https://jsr.io/badges/@tundraconnect/cloudflare-dns)](https://jsr.io/@tundraconnect/cloudflare-dns)
[![JSR Score](https://jsr.io/badges/@tundraconnect/cloudflare-dns/score)](https://jsr.io/@tundraconnect/cloudflare-dns)

## Overview

Cloudflare's DNS API lives under `/zones/{zone_id}/dns_records` in its
`client/v4` REST API. This connect covers the record lifecycle a service
needs when it provisions subdomains, ACME challenges or customer CNAMEs:

- **Records:** `listRecords` (filters, paging, ordering), `getRecord`,
  `createRecord`, `updateRecord` (PATCH), `replaceRecord` (PUT),
  `deleteRecord`, an atomic `batch`, and `exportRecords` (BIND text).
- **Zones:** `listZones` (filter by `name` to turn a domain into a zone
  id) and `getZone`.
- Every method targets the client's `zoneId` unless the call passes its
  own, so one client can serve one zone or many.
- Cloudflare's `{success, errors, messages, result}` envelope is unwrapped:
  methods resolve to the record, and list methods to
  `{ result, result_info }` for paging.
- Failures map Cloudflare's numeric codes onto stable names:
  `RECORD_CONFLICT` for 81053/81056/81057, `NOT_FOUND` for 81044 and a bad
  zone id (7003), `AUTH_FAILED` for the 9xxx/10000 family, and so on.

```ts
import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';
import { CloudflareDNSError } from '@tundraconnect/cloudflare-dns/errors';

const dns = new CloudflareDNS({
  auth: { type: 'BEARER', token: 'YOUR_API_TOKEN' },
  zoneId: 'YOUR_ZONE_ID',
});

try {
  const record = await dns.createRecord({
    type: 'CNAME',
    name: 'acme.example.com',
    content: 'app.example.com',
    proxied: true,
    comment: 'tenant: acme',
  });
  console.log('created', record.id);
} catch (err) {
  if (err instanceof CloudflareDNSError && err.code === 'RECORD_CONFLICT') {
    // an identical or conflicting record already exists
  } else {
    throw err;
  }
}
```

```ts continued
// Find it again, change it, remove it.
const { result } = await dns.listRecords({
  type: 'CNAME',
  name: 'acme.example.com',
});
const id = result[0]!.id;
await dns.updateRecord({ recordId: id, content: 'app-v2.example.com' });
await dns.deleteRecord({ recordId: id });

// Many changes at once, applied atomically.
await dns.batch({
  posts: [
    { type: 'A', name: 'a.example.com', content: '203.0.113.1' },
    { type: 'A', name: 'b.example.com', content: '203.0.113.2' },
  ],
});

// Which zone is example.com?
const zones = await dns.listZones({ name: 'example.com' });
console.log(zones.result[0]?.id);
```

Timeouts, network failures, 5xx and 429 surface as `TIMEOUT`,
`NETWORK_ERROR`, `SERVICE_UNAVAILABLE` and `RATE_LIMITED`, all flagged
`transient: true`, so "unreachable, retry later" is one check.

## Endpoints

| Method                                             | Request                                    |
| -------------------------------------------------- | ------------------------------------------ |
| `listZones({ name?, status?, … })`                 | `GET /zones`                               |
| `getZone({ zoneId? })`                             | `GET /zones/{zone_id}`                     |
| `listRecords({ type?, name?, … })`                 | `GET /zones/{zone_id}/dns_records`         |
| `getRecord({ recordId })`                          | `GET /zones/{zone_id}/dns_records/{id}`    |
| `createRecord({ type, name, content \| data, … })` | `POST /zones/{zone_id}/dns_records`        |
| `updateRecord({ recordId, …changes })`             | `PATCH /zones/{zone_id}/dns_records/{id}`  |
| `replaceRecord({ recordId, …record })`             | `PUT /zones/{zone_id}/dns_records/{id}`    |
| `deleteRecord({ recordId })`                       | `DELETE /zones/{zone_id}/dns_records/{id}` |
| `batch({ deletes?, patches?, puts?, posts? })`     | `POST /zones/{zone_id}/dns_records/batch`  |
| `exportRecords()`                                  | `GET /zones/{zone_id}/dns_records/export`  |

Every record method also takes an optional `zoneId` that overrides the
client's. Zone creation/deletion, the BIND **import**, DNS scanning and
zone-level DNS settings are not wrapped.

## API token

Create a token at
[dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
with:

- **Zone → DNS → Edit** on the zone(s) you manage (Read is enough for
  `listRecords`, `getRecord` and `exportRecords`);
- **Zone → Zone → Read** for `listZones` / `getZone`.

A token that authenticates but lacks a permission fails as `FORBIDDEN`
rather than `AUTH_FAILED`. Cloudflare's global API rate limit is 1,200
requests per five minutes per user; a 429 surfaces as `RATE_LIMITED` with
`retryAfterSeconds` when Cloudflare sends a hint.

## Custom transport

To route requests through your own transport (a test double, a tracing
wrapper), subclass the client and reassign the protected `_fetch`:

```ts
import {
  CloudflareDNS,
  type CloudflareDNSOptions,
} from '@tundraconnect/cloudflare-dns';

class RoutedDNS extends CloudflareDNS {
  constructor(options: CloudflareDNSOptions, transport: typeof fetch) {
    super(options);
    this._fetch = transport;
  }
}
```

## Testing your code

Your tests don't need to fake HTTP. Have your code take a `CloudflareDNS`
instance and pass in a stand-in that returns the shapes from
`@tundraconnect/cloudflare-dns/schemas` or throws a real `CloudflareDNSError`:

```ts
import { CloudflareDNSError } from '@tundraconnect/cloudflare-dns/errors';

const outage = new CloudflareDNSError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(outage.code);
```

To exercise the client itself against a fake transport, subclass it and
reassign the protected `_fetch` (see Custom transport above).

## Documentation

| Topic                                                                              | Description                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/CloudflareDNS-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/CloudflareDNS-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/CloudflareDNS-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [DNS records API reference](https://developers.cloudflare.com/api/resources/dns/subresources/records/)
- [Zones API reference](https://developers.cloudflare.com/api/resources/zones/)
- [Manage DNS records](https://developers.cloudflare.com/dns/manage-dns-records/)
- [API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/cloudflare-dns
```

**Bun:**

```sh
bunx jsr add @tundraconnect/cloudflare-dns
```

**Node.js:**

```sh
npx jsr add @tundraconnect/cloudflare-dns
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
