# CloudflareDNS Schemas

Public Guardian schemas, exported from `@tundraconnect/cloudflare-dns/schemas`.

```ts
import {
  DnsRecordRequestSchemaObject,
  DnsRecordSchemaObject,
} from '@tundraconnect/cloudflare-dns/schemas';
```

| Export                                     | Type                          | Used for                                    |
| ------------------------------------------ | ----------------------------- | ------------------------------------------- |
| `DnsRecordSchemaObject`                    | `DnsRecordSchema`             | One record in any response.                 |
| `DnsRecordPageSchemaObject`                | `DnsRecordPageSchema`         | `listRecords` — `{ result, result_info? }`. |
| `DnsRecordRequestSchemaObject`             | `DnsRecordRequestSchema`      | `createRecord` / `replaceRecord` body.      |
| `DnsRecordPatchSchemaObject`               | `DnsRecordPatchSchema`        | `updateRecord` body (every field optional). |
| `DnsRecordBatchRequestSchemaObject`        | `DnsRecordBatchRequestSchema` | `batch` body.                               |
| `DnsRecordBatchResultSchemaObject`         | `DnsRecordBatchResultSchema`  | `batch` result.                             |
| `DnsRecordTypeSchemaObject`                | `DnsRecordTypeSchema`         | A record type in a request.                 |
| `ZoneSchemaObject`                         | `ZoneSchema`                  | One zone.                                   |
| `ZonePageSchemaObject`                     | `ZonePageSchema`              | `listZones` — `{ result, result_info? }`.   |
| `ListDnsRecordsQuerySchemaObject`          | `ListDnsRecordsQuerySchema`   | `listRecords` filters, paging and ordering. |
| `ListZonesQuerySchemaObject`               | `ListZonesQuerySchema`        | `listZones` filters, paging and ordering.   |
| `ResultInfoSchemaObject`                   | `ResultInfoSchema`            | Cloudflare's paging block.                  |
| `ErrorEnvelopeSchemaObject`                | `ErrorEnvelopeSchema`         | The failure form of the envelope.           |
| `ErrorItemSchemaObject`                    | `ErrorItemSchema`             | One `errors` entry, with its `error_chain`. |
| `DNS_RECORD_TYPES`                         | `readonly [...]`              | Every record type Cloudflare accepts.       |
| `DNS_RECORD_ORDERS`                        | `readonly [...]`              | `listRecords` `order` values.               |
| `ZONE_STATUSES`, `ZONE_ORDERS`             | `readonly [...]`              | `listZones` `status` / `order` values.      |
| `MAX_RECORDS_PER_PAGE`                     | `5000000`                     | `listRecords` `per_page` ceiling.           |
| `MIN_ZONES_PER_PAGE`, `MAX_ZONES_PER_PAGE` | `5`, `50`                     | `listZones` `per_page` bounds.              |

## Requests are strict, responses are lenient

**Requests** (`DnsRecordRequestSchema`, `DnsRecordPatchSchema`, the query
schemas) model Cloudflare's documented constraints so a mistake is caught
before anything is sent: `type` is the closed `DNS_RECORD_TYPES` enum,
`name` is non-empty and at most 255 characters, `ttl` is `1` or 30–86400,
`priority` and `per_page` are integers in range, `proxied` must be a real
boolean. Field names are Cloudflare's own, so a body copied from its docs
works unchanged. The either/or of `content` vs `data` is enforced by the
client, since an object schema cannot express it.

**Responses** (`DnsRecordSchema`, `ZoneSchema`) require only the identity
fields (`id`, `name`, `type` for a record; `id`, `name` for a zone):

- **Enumerations are documented, not enforced.** A record's `type` and a
  zone's `status` are `string`, so a value Cloudflare adds later never
  fails a read.
- **Open blocks stay open.** `data`, `settings`, `meta`, `owner`, `plan`
  are `Record<string, unknown>`, with `null` values allowed.
- **Nullable where Cloudflare nulls.** `comment`, `original_name_servers`,
  `activated_on` accept `null`.
- **Unknown keys pass through**, so an additive field never fails a read.

---

[← Back to CloudflareDNS](../README.md)
