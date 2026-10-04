# CloudflareSaaS API

Client configuration and endpoint methods for `@tundraconnect/cloudflare-saas`.

## Configuration

```ts
import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';

const saas = new CloudflareSaaS({
  auth: { type: 'BEARER', token: 'YOUR_API_TOKEN' },
  zoneId: 'YOUR_SAAS_ZONE_ID',
});
```

| Option    | Type                 | Required | Default                                | Description                                                                                        |
| --------- | -------------------- | -------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `auth`    | `CloudflareSaaSAuth` | yes      | —                                      | `{ type: 'BEARER', token, prefix? }`. `prefix` defaults to `Bearer`.                               |
| `zoneId`  | `string`             | yes      | —                                      | The zone Cloudflare for SaaS is enabled on.                                                        |
| `timeout` | `number`             | no       | `30`                                   | Per-request timeout in seconds, 1–120, fractions allowed. Missing it throws a transient `TIMEOUT`. |
| `baseURL` | `string`             | no       | `https://api.cloudflare.com/client/v4` | Override for a proxy or a test double.                                                             |

`auth` missing, not `BEARER`, or with a blank `token` &rarr;
`CONFIG_INVALID_API_TOKEN`; `zoneId` missing, blank or not an identifier
&rarr; `CONFIG_INVALID_ZONE_ID`. Both at construction.

### Getters

| Getter   | Type     | Description                |
| -------- | -------- | -------------------------- |
| `vendor` | `string` | Always `'CloudflareSaaS'`. |
| `zoneId` | `string` | The configured zone id.    |

### Constants

| Export           | Value                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| `CLOUDFLARE_API` | `https://api.cloudflare.com/client/v4`                                |
| `DEFAULT_SSL`    | `{ method: 'http', type: 'dv' }` — sent when a create names no `ssl`. |

## Results

Cloudflare wraps every response in `{ success, errors, messages, result }`.
Methods resolve to the unwrapped `result`; `listCustomHostnames` resolves
to `{ result, result_info }`.

## The lifecycle

A custom hostname starts `pending` and becomes `active` once Cloudflare has
seen proof the customer controls it; separately, `ssl.status` moves from
`pending_validation` through `pending_issuance` and `pending_deployment` to
`active`. Two things carry the proof:

- **Hostname ownership** — the customer CNAMEs at your SaaS target
  (real-time validation), or publishes the `ownership_verification` TXT
  record / serves the `ownership_verification_http` token first
  (pre-validation, no downtime).
- **Certificate issuance (DCV)** — `ssl.method`: `http` (Cloudflare serves
  the token once traffic flows through it), `txt` (the customer publishes
  `ssl.validation_records[].txt_name` / `txt_value`), or `email`.

Poll `getCustomHostname` until `status === 'active' && ssl.status === 'active'`.
The documented values are exported as `CUSTOM_HOSTNAME_STATUSES` and
`CUSTOM_HOSTNAME_SSL_STATUSES`.

## Custom hostnames

### `listCustomHostnames({ hostname?, id?, hostname_status?, ssl_status?, certificate_authority?, wildcard?, custom_origin_server?, page?, per_page?, order?, direction? })`

`GET /zones/{zone_id}/custom_hostnames` &rarr; `CustomHostnamePageSchema`.
`per_page` is 5–1000 (default 20); `order` is `ssl` or `ssl_status`.
Cloudflare documents `hostname` as a fully qualified name, but it has been
seen matching partially. To look up one customer's hostname, use
`findCustomHostname` instead.

```ts
import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';

declare const saas: CloudflareSaaS;

const pending = await saas.listCustomHostnames({ hostname_status: 'pending' });
for (const h of pending.result) console.log(h.hostname, h.ssl?.status);
```

### `findCustomHostname({ hostname })`

`GET /zones/{zone_id}/custom_hostnames?hostname.exact=<hostname>` &rarr;
`CustomHostnameSchema | null`. The hostname is trimmed and lower-cased,
and the result is re-checked case-insensitively, so a partial match is
never returned. `null` means the zone has no custom hostname by that name.

```ts
import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';

declare const saas: CloudflareSaaS;

const existing = await saas.findCustomHostname({
  hostname: 'app.customer.com',
});
if (existing === null) {
  // not attached yet
}
```

### `createCustomHostname({ hostname, ssl?, custom_metadata?, custom_origin_server?, custom_origin_sni? })`

`POST /zones/{zone_id}/custom_hostnames` &rarr; `CustomHostnameSchema`
(Cloudflare answers `201`). Validated locally against
`CreateCustomHostnameRequestSchema`: `hostname` and the origin fields must
look like hostnames (optional leading `*.`), `ssl` must use documented
values. When `ssl` is omitted, `DEFAULT_SSL` is sent.

| `ssl` field                                                                  | Values                                                          |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `method`                                                                     | `http`, `txt`, `email`                                          |
| `type`                                                                       | `dv`                                                            |
| `bundle_method`                                                              | `ubiquitous` (default), `optimal`, `force`                      |
| `certificate_authority`                                                      | `digicert`, `google`, `lets_encrypt`, `ssl_com`                 |
| `cloudflare_branding`                                                        | `boolean` — needed for hostnames over 64 chars                  |
| `wildcard`                                                                   | `boolean` (Enterprise)                                          |
| `custom_certificate` / `custom_key` / `custom_cert_bundle` / `custom_csr_id` | uploaded certificates (Enterprise)                              |
| `settings`                                                                   | `min_tls_version`, `http2`, `tls_1_3`, `early_hints`, `ciphers` |

### `getCustomHostname({ id })`

`GET /zones/{zone_id}/custom_hostnames/{id}` &rarr; `CustomHostnameSchema`.
`id` is the custom hostname's id, not the hostname.

### `updateCustomHostname({ id, ssl?, custom_metadata?, custom_origin_server?, custom_origin_sni? })`

`PATCH /zones/{zone_id}/custom_hostnames/{id}` &rarr; `CustomHostnameSchema`
(Cloudflare answers `202`; the change applies asynchronously). At least one
field is required. Re-sending `ssl` with the current `method` and `type`
retries a validation that timed out; sending a different `method` switches
it.

### `deleteCustomHostname({ id })`

`DELETE /zones/{zone_id}/custom_hostnames/{id}` &rarr; `{ id }`. Also
removes any certificate issued for the hostname.

### Reading the certificate state

| Field                              | Meaning                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `ssl.status`, `ssl.method`         | Where issuance is, and how the CA validates.                                          |
| `ssl.validation_records[]`         | What to publish (`txt_name`/`txt_value`, `http_url`/`http_body`, …).                  |
| `ssl.txt_name`, `ssl.txt_value`, … | The older top-level form some responses still carry. Read `validation_records` first. |
| `ssl.certificates[]`               | Issued certificates: `issuer`, `issued_on`, `expires_on`, …                           |
| `ssl.issued_on`, `ssl.expires_on`  | Fallback when `certificates` is absent.                                               |
| `ssl.validation_errors[].message`  | What the CA reported.                                                                 |
| `verification_errors[]`            | Why hostname ownership has not been confirmed.                                        |

## Fallback origin and quota

### `getFallbackOrigin()` / `setFallbackOrigin({ origin })` / `deleteFallbackOrigin()`

`GET` / `PUT` / `DELETE /zones/{zone_id}/custom_hostnames/fallback_origin`
&rarr; `FallbackOriginSchema` with `origin`, `status` (one of
`FALLBACK_ORIGIN_STATUSES`) and `errors`. The origin must already exist as
a DNS record in the zone. `getFallbackOrigin` answers `NOT_FOUND` when none
is configured.

### `getQuota()`

`GET /zones/{zone_id}/custom_hostnames/quota` &rarr;
`CustomHostnameQuotaSchema` with `allocated`, `used`, `hard_cap` and
`exceeded`.

## Identifiers

Zone and custom hostname ids are validated as URL-safe identifiers
(letters, digits, `-`, `_`; at most 64 characters) before they are placed
in a path, so a malformed id is a `REQUEST_VALIDATION_ERROR` rather than a
request to the wrong URL.

## Not wrapped

Replacing a single uploaded certificate inside a certificate pack
(`…/custom_hostnames/{id}/certificate_pack/{pack}/certificates/{cert}`),
and the zone-level Cloudflare for SaaS settings (enabling the feature, the
SaaS target record, DCV delegation setup) which are dashboard or other-API
operations.

## Custom transport

Subclass and reassign the protected `_fetch`:

```ts
import {
  CloudflareSaaS,
  type CloudflareSaaSOptions,
} from '@tundraconnect/cloudflare-saas';

class RoutedSaaS extends CloudflareSaaS {
  constructor(options: CloudflareSaaSOptions, transport: typeof fetch) {
    super(options);
    this._fetch = transport;
  }
}
```

---

[← Back to CloudflareSaaS](../README.md)
