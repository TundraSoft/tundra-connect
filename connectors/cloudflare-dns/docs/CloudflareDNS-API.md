# CloudflareDNS API

Client configuration and endpoint methods for `@tundraconnect/cloudflare-dns`.

## Configuration

```ts
import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';

const dns = new CloudflareDNS({
  auth: { type: 'BEARER', token: 'YOUR_API_TOKEN' },
  zoneId: 'YOUR_ZONE_ID',
});
```

| Option    | Type                | Required | Default                                | Description                                                               |
| --------- | ------------------- | -------- | -------------------------------------- | ------------------------------------------------------------------------- |
| `auth`    | `CloudflareDNSAuth` | yes      | —                                      | `{ type: 'BEARER', token, prefix? }`. `prefix` defaults to `Bearer`.      |
| `zoneId`  | `string`            | no       | —                                      | Default zone for every record method; a call's own `zoneId` overrides it. |
| `timeout` | `number`            | no       | `30`                                   | Per-request timeout in seconds.                                           |
| `baseURL` | `string`            | no       | `https://api.cloudflare.com/client/v4` | Override for a proxy or a test double.                                    |

`auth` missing, not `BEARER`, or with a blank `token` &rarr;
`CONFIG_INVALID_API_TOKEN` at construction. A `zoneId` that is given but
blank or not an identifier &rarr; `CONFIG_INVALID_ZONE_ID`. A record method
called with no zone id from either place &rarr; `REQUEST_VALIDATION_ERROR`.

### Getters

| Getter   | Type                  | Description                           |
| -------- | --------------------- | ------------------------------------- |
| `vendor` | `string`              | Always `'CloudflareDNS'`.             |
| `zoneId` | `string \| undefined` | The client's default zone id, if any. |

## Results

Cloudflare wraps every response in `{ success, errors, messages, result }`.
Methods resolve to the unwrapped `result`; list methods resolve to
`{ result, result_info }`, where `result_info` carries `page`, `per_page`,
`count`, `total_count` and `total_pages`.

## Zones

### `listZones({ name?, status?, match?, page?, per_page?, order?, direction? })`

`GET /zones` &rarr; `ZonePageSchema`. `name` is an exact domain; `per_page`
is 5–50 (default 20).

```ts
import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';

declare const dns: CloudflareDNS;

const { result } = await dns.listZones({ name: 'example.com' });
const zoneId = result[0]?.id;
```

### `getZone({ zoneId? })`

`GET /zones/{zone_id}` &rarr; `ZoneSchema`. `NOT_FOUND` for an unknown
zone.

## Records

Every record method takes an optional `zoneId`.

### `listRecords({ type?, name?, content?, proxied?, comment?, tag?, search?, match?, tag_match?, page?, per_page?, order?, direction? })`

`GET /zones/{zone_id}/dns_records` &rarr; `DnsRecordPageSchema`. Filters use
Cloudflare's own names and exact matching; `search` is a free-text match
across name, content, comment and tags. `per_page` defaults to 100 and
goes up to 5,000,000; `order` is one of `type`, `name`, `content`, `ttl`,
`proxied`.

### `getRecord({ recordId })`

`GET /zones/{zone_id}/dns_records/{id}` &rarr; `DnsRecordSchema`.

### `createRecord({ type, name, content?, data?, ttl?, proxied?, priority?, comment?, tags?, settings? })`

`POST /zones/{zone_id}/dns_records` &rarr; `DnsRecordSchema`. Validated
locally against `DnsRecordRequestSchema`: a known `type`, a non-empty
`name` (≤ 255 characters), `ttl` of `1` (automatic) or 30–86400, `priority`
0–65535, and either `content` or `data`. Cloudflare validates the content
itself; its code 1004 surfaces as `INVALID_REQUEST`.

| Record kind                                                                   | Use                                |
| ----------------------------------------------------------------------------- | ---------------------------------- |
| A, AAAA, CNAME, NS, PTR, TXT, MX, OPENPGPKEY                                  | `content` (plus `priority` for MX) |
| SRV, CAA, LOC, TLSA, SSHFP, DS, DNSKEY, CERT, HTTPS, SVCB, NAPTR, SMIMEA, URI | `data` with the type's components  |

```ts
import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';

declare const dns: CloudflareDNS;

await dns.createRecord({
  type: 'SRV',
  name: '_sip._tcp.example.com',
  data: { priority: 10, weight: 5, port: 5060, target: 'sip.example.com' },
  ttl: 3600,
});
```

### `updateRecord({ recordId, …changes })`

`PATCH /zones/{zone_id}/dns_records/{id}` &rarr; `DnsRecordSchema`. Only
the given fields change; at least one is required.

### `replaceRecord({ recordId, type, name, content?, data?, … })`

`PUT /zones/{zone_id}/dns_records/{id}` &rarr; `DnsRecordSchema`. The whole
record is replaced; omitted fields reset to their defaults.

### `deleteRecord({ recordId })`

`DELETE /zones/{zone_id}/dns_records/{id}` &rarr; `{ id }`.

### `batch({ deletes?, patches?, puts?, posts? })`

`POST /zones/{zone_id}/dns_records/batch` &rarr; `DnsRecordBatchResultSchema`.
Cloudflare applies `deletes`, then `patches`, then `puts`, then `posts`,
atomically: if any one fails the whole batch is rolled back and the error
is thrown. At least one list must be non-empty; every put/post needs
`content` or `data`.

```ts
import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';

declare const dns: CloudflareDNS;

const result = await dns.batch({
  deletes: [{ id: 'OLD_RECORD_ID' }],
  patches: [{ id: 'RECORD_ID', comment: 'reviewed' }],
  posts: [{ type: 'TXT', name: 'example.com', content: '"v=spf1 -all"' }],
});
console.log(result.posts?.[0]?.id);
```

### `exportRecords({ zoneId? })`

`GET /zones/{zone_id}/dns_records/export` &rarr; `string`, the zone as a
BIND zone file.

## Identifiers

Zone and record ids are validated as URL-safe identifiers (letters, digits,
`-`, `_`; at most 64 characters) before they are placed in a path, so a
malformed id is a `REQUEST_VALIDATION_ERROR` rather than a request to the
wrong URL.

## Not wrapped

Zone creation and deletion, the BIND import
(`POST /dns_records/import`), DNS record scanning, the `include_shadow_metadata`
flag, and zone-level DNS settings. The dotted filter variants
(`name.contains`, `content.startswith`, …) are also left out; `search`
covers the common case.

## Custom transport

Subclass and reassign the protected `_fetch`:

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

---

[← Back to CloudflareDNS](../README.md)
