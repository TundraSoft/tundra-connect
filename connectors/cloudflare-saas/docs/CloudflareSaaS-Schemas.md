# CloudflareSaaS Schemas

Public Guardian schemas, exported from `@tundraconnect/cloudflare-saas/schemas`.

```ts
import {
  CreateCustomHostnameRequestSchemaObject,
  CustomHostnameSchemaObject,
} from '@tundraconnect/cloudflare-saas/schemas';
```

| Export                                                     | Type                                | Used for                                            |
| ---------------------------------------------------------- | ----------------------------------- | --------------------------------------------------- |
| `CustomHostnameSchemaObject`                               | `CustomHostnameSchema`              | One custom hostname in any response.                |
| `CustomHostnamePageSchemaObject`                           | `CustomHostnamePageSchema`          | `listCustomHostnames` — `{ result, result_info? }`. |
| `CustomHostnameSslSchemaObject`                            | `CustomHostnameSslSchema`           | The `ssl` block of a hostname.                      |
| `ValidationRecordSchemaObject`                             | `ValidationRecordSchema`            | One DCV record (TXT / HTTP / CNAME / email).        |
| `CreateCustomHostnameRequestSchemaObject`                  | `CreateCustomHostnameRequestSchema` | `createCustomHostname` body.                        |
| `UpdateCustomHostnameRequestSchemaObject`                  | `UpdateCustomHostnameRequestSchema` | `updateCustomHostname` body.                        |
| `SslRequestSchemaObject`                                   | `SslRequestSchema`                  | The `ssl` block of a request.                       |
| `FallbackOriginSchemaObject`                               | `FallbackOriginSchema`              | The fallback origin.                                |
| `FallbackOriginRequestSchemaObject`                        | `FallbackOriginRequestSchema`       | `setFallbackOrigin` body.                           |
| `CustomHostnameQuotaSchemaObject`                          | `CustomHostnameQuotaSchema`         | `getQuota` result.                                  |
| `ListCustomHostnamesQuerySchemaObject`                     | `ListCustomHostnamesQuerySchema`    | `listCustomHostnames` filters, paging and ordering. |
| `ResultInfoSchemaObject`                                   | `ResultInfoSchema`                  | Cloudflare's paging block.                          |
| `ErrorEnvelopeSchemaObject`                                | `ErrorEnvelopeSchema`               | The failure form of the envelope.                   |
| `ErrorItemSchemaObject`                                    | `ErrorItemSchema`                   | One `errors` entry, with its `error_chain`.         |
| `CUSTOM_HOSTNAME_STATUSES`                                 | `readonly [...]`                    | Every documented hostname `status`.                 |
| `CUSTOM_HOSTNAME_SSL_STATUSES`                             | `readonly [...]`                    | Every documented `ssl.status`.                      |
| `FALLBACK_ORIGIN_STATUSES`                                 | `readonly [...]`                    | Every documented fallback origin `status`.          |
| `DCV_METHODS`, `CERTIFICATE_AUTHORITIES`, `BUNDLE_METHODS` | `readonly [...]`                    | `ssl` request enumerations.                         |
| `MAX_HOSTNAME_LENGTH`                                      | `255`                               | Longest hostname accepted.                          |
| `MIN_HOSTNAMES_PER_PAGE`, `MAX_HOSTNAMES_PER_PAGE`         | `5`, `1000`                         | `listCustomHostnames` `per_page` bounds.            |

## Requests are strict, responses are lenient

**Requests** (`CreateCustomHostnameRequestSchema`,
`UpdateCustomHostnameRequestSchema`, `SslRequestSchema`,
`FallbackOriginRequestSchema`, the query schema) catch a mistake before
anything is sent: a hostname must look like one (dot-separated labels, an
optional leading `*.`, at most 255 characters — Cloudflare's further rules
about IP addresses and reserved TLDs come back as `INVALID_HOSTNAME`), the
`ssl` enumerations are closed, `per_page` is 5–1000, booleans must be real
booleans. Field names are Cloudflare's own, so a body copied from its docs
works unchanged.

**Responses** (`CustomHostnameSchema`, `CustomHostnameSslSchema`,
`FallbackOriginSchema`, `CustomHostnameQuotaSchema`) require only the
identity fields (`id`, `hostname`):

- **Enumerations are documented, not enforced.** `status`, `ssl.status`,
  `ssl.method`, `ssl.certificate_authority` are `string`, so a value
  Cloudflare adds later never fails a read. The documented values are in
  the exported constants.
- **Nullable where Cloudflare nulls.** `ssl`, `custom_metadata`,
  `custom_origin_server`, `custom_origin_sni`, `ownership_verification`,
  `ownership_verification_http` accept `null`.
- **Open blocks stay open.** `custom_metadata` and `ssl.settings` are
  `Record<string, unknown>`, with `null` values allowed.
- **Unknown keys pass through**, so an additive field never fails a read.

---

[← Back to CloudflareSaaS](../README.md)
