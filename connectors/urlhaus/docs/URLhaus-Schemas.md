# URLhaus Schemas

Public Guardian schemas, exported from `@tundraconnect/urlhaus/schemas`.

```ts
import {
  HostEntrySchemaObject,
  UrlEntrySchemaObject,
} from '@tundraconnect/urlhaus/schemas';
```

| Export                            | Type                        | Used for                                               |
| --------------------------------- | --------------------------- | ------------------------------------------------------ |
| `QueryStatusEnvelopeSchemaObject` | `QueryStatusEnvelopeSchema` | The `query_status` every response carries.             |
| `UrlEntrySchemaObject`            | `UrlEntrySchema`            | `/v1/url/` and `/v1/urlid/` `ok` bodies.               |
| `UrlPayloadSchemaObject`          | `UrlPayloadSchema`          | One file a URL served.                                 |
| `HostEntrySchemaObject`           | `HostEntrySchema`           | `/v1/host/` `ok` body.                                 |
| `HostUrlSchemaObject`             | `HostUrlSchema`             | One malware URL on a host.                             |
| `PayloadEntrySchemaObject`        | `PayloadEntrySchema`        | `/v1/payload/` `ok` body, and one recent-feed payload. |
| `PayloadUrlSchemaObject`          | `PayloadUrlSchema`          | One URL that served a payload.                         |
| `TagEntrySchemaObject`            | `TagEntrySchema`            | `/v1/tag/` `ok` body.                                  |
| `TagUrlSchemaObject`              | `TagUrlSchema`              | One URL carrying a tag.                                |
| `SignatureEntrySchemaObject`      | `SignatureEntrySchema`      | `/v1/signature/` `ok` body.                            |
| `SignatureUrlSchemaObject`        | `SignatureUrlSchema`        | One URL serving a malware family.                      |
| `RecentUrlsSchemaObject`          | `RecentUrlsSchema`          | `/v1/urls/recent/` `ok` body.                          |
| `RecentUrlSchemaObject`           | `RecentUrlSchema`           | One recent URL.                                        |
| `RecentPayloadsSchemaObject`      | `RecentPayloadsSchema`      | `/v1/payloads/recent/` `ok` body.                      |
| `BlacklistsSchemaObject`          | `BlacklistsSchema`          | Spamhaus DBL / SURBL status.                           |
| `VirusTotalSchemaObject`          | `VirusTotalSchema`          | VirusTotal ratio, percentage and link.                 |
| `URLHAUS_QUERY_STATUSES`          | `readonly [...]`            | Every documented `query_status`.                       |

## Leniency, deliberately

These schemas describe the wire exactly, and they are lenient:

- **Every field is optional**, and fields URLhaus documents as possibly
  `null` (`last_online`, `tags`, `signature`, `virustotal`, …) also accept
  `null`. URLhaus's own example responses disagree with its field list in
  places. For a safety lookup, a missing cosmetic field must never turn a
  _listed_ URL into a `RESPONSE_ERROR`.
- **Numbers stay strings.** URLhaus sends ids, counts and sizes as strings
  (`"120"`). They are kept that way, and a JSON number in those fields is
  accepted and stringified.
- **Enumerations are documented, not enforced.** `url_status` (`online` /
  `offline` / `unknown`), `threat` (`malware_download`) and the blacklist
  values are typed as `string`, so a new vendor value doesn't fail a lookup.
- **Unknown keys pass through**, so an additive field never fails a lookup.

---

[← Back to URLhaus](../README.md)
