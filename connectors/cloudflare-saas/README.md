# CloudflareSaaS

Typed Cloudflare for SaaS client for Deno, Bun, Node.js and Cloudflare
Workers: add a customer's domain as a custom hostname, read its
ownership-verification and certificate-validation state, update or remove
it, list and page through all of them, and manage the zone's fallback
origin and hostname quota. Requests are validated locally, responses are
unwrapped from Cloudflare's envelope and validated, and every failure is one
typed error.

[![JSR](https://jsr.io/badges/@tundraconnect/cloudflare-saas)](https://jsr.io/@tundraconnect/cloudflare-saas)
[![JSR Score](https://jsr.io/badges/@tundraconnect/cloudflare-saas/score)](https://jsr.io/@tundraconnect/cloudflare-saas)

## Overview

Cloudflare for SaaS lets a platform serve customer-owned domains
(`app.customer.com`) from its own Cloudflare zone. The customer CNAMEs their
domain at the platform's **SaaS target** (`customers.yourapp.com`); the
platform registers the domain as a **custom hostname**; Cloudflare verifies
ownership, issues a certificate, and routes traffic to the zone's
**fallback origin** (or a per-hostname custom origin). This connect wraps
that lifecycle, which lives under `/zones/{zone_id}/custom_hostnames`:

- `createCustomHostname`, `getCustomHostname`, `updateCustomHostname`,
  `deleteCustomHostname`, and `listCustomHostnames` with filters and
  paging.
- `getFallbackOrigin`, `setFallbackOrigin`, `deleteFallbackOrigin`, and
  `getQuota`.
- Cloudflare's `{success, errors, messages, result}` envelope is unwrapped:
  methods resolve to the hostname, and the list to `{ result, result_info }`.
- Failures map Cloudflare's documented 14xx codes onto stable names:
  `DUPLICATE_HOSTNAME` (1406), `INVALID_HOSTNAME` (1407–1411, 1415–1421),
  `QUOTA_EXCEEDED` (1404/1405), `NOT_FOUND` (1436), `FORBIDDEN` for an
  entitlement the plan lacks (1413/1414).

```ts
import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';
import { CloudflareSaaSError } from '@tundraconnect/cloudflare-saas/errors';

const saas = new CloudflareSaaS({
  auth: { type: 'BEARER', token: 'YOUR_API_TOKEN' },
  zoneId: 'YOUR_SAAS_ZONE_ID',
});

// 1. A customer enters `app.customer.com` in your onboarding flow.
try {
  const created = await saas.createCustomHostname({
    hostname: 'app.customer.com',
    ssl: { method: 'txt', type: 'dv' }, // validate before they change DNS
  });
  // 2. Show them what to publish: the ownership TXT and the DCV TXT.
  console.log(created.ownership_verification);
  console.log(created.ssl?.validation_records);
} catch (err) {
  if (err instanceof CloudflareSaaSError && err.code === 'DUPLICATE_HOSTNAME') {
    // already attached — look it up with listCustomHostnames({ hostname })
  } else {
    throw err;
  }
}
```

```ts continued
// 3. Poll until both statuses are active, then tell them to CNAME at your
//    SaaS target.
const { result } = await saas.listCustomHostnames({
  hostname: 'app.customer.com',
});
const current = await saas.getCustomHostname({ id: result[0]!.id });
// (or, exact and null-safe: await saas.findCustomHostname({ hostname }))
const live = current.status === 'active' && current.ssl?.status === 'active';

// 4. If HTTP validation timed out, retry over TXT.
if (current.ssl?.status === 'validation_timed_out') {
  await saas.updateCustomHostname({
    id: current.id,
    ssl: { method: 'txt', type: 'dv' },
  });
}

// Offboarding.
await saas.deleteCustomHostname({ id: current.id });
console.log(live);
```

Timeouts, network failures, 5xx and 429 surface as `TIMEOUT`,
`NETWORK_ERROR`, `SERVICE_UNAVAILABLE` and `RATE_LIMITED`, all flagged
`transient: true`, so "unreachable, retry later" is one check.

## Endpoints

| Method                                                          | Request                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| `listCustomHostnames({ hostname?, hostname_status?, … })`       | `GET /zones/{zone_id}/custom_hostnames`                    |
| `findCustomHostname({ hostname })`                              | `GET /zones/{zone_id}/custom_hostnames?hostname.exact=…`   |
| `createCustomHostname({ hostname, ssl?, custom_metadata?, … })` | `POST /zones/{zone_id}/custom_hostnames`                   |
| `getCustomHostname({ id })`                                     | `GET /zones/{zone_id}/custom_hostnames/{id}`               |
| `updateCustomHostname({ id, ssl?, custom_metadata?, … })`       | `PATCH /zones/{zone_id}/custom_hostnames/{id}`             |
| `deleteCustomHostname({ id })`                                  | `DELETE /zones/{zone_id}/custom_hostnames/{id}`            |
| `getFallbackOrigin()`                                           | `GET /zones/{zone_id}/custom_hostnames/fallback_origin`    |
| `setFallbackOrigin({ origin })`                                 | `PUT /zones/{zone_id}/custom_hostnames/fallback_origin`    |
| `deleteFallbackOrigin()`                                        | `DELETE /zones/{zone_id}/custom_hostnames/fallback_origin` |
| `getQuota()`                                                    | `GET /zones/{zone_id}/custom_hostnames/quota`              |

Replacing an uploaded certificate on an existing certificate pack
(`…/certificate_pack/{id}/certificates/{id}`) is not wrapped.

## Prerequisites and token

- **Cloudflare for SaaS enabled** on the zone (Dashboard → SSL/TLS →
  Custom Hostnames). The first 100 custom hostnames are free on every plan;
  `getQuota` reports the allocation.
- **A fallback origin** set (`setFallbackOrigin`) and a **SaaS target** DNS
  record (`customers.yourapp.com`, proxied) your customers CNAME at. The
  fallback origin must itself be a DNS record in the zone — pair this
  connect with `@tundraconnect/cloudflare-dns` to create it.
- **An API token** from
  [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
  with **Zone → SSL and Certificates → Edit** on the SaaS zone (Read is
  enough for the list/get methods). Custom metadata and custom origin
  servers are Enterprise entitlements; without them Cloudflare answers
  `FORBIDDEN`.

A token that authenticates but lacks the permission fails as `FORBIDDEN`
rather than `AUTH_FAILED`. Cloudflare's global API rate limit is 1,200
requests per five minutes per user; a 429 surfaces as `RATE_LIMITED`.

## Custom transport

To route requests through your own transport (a test double, a tracing
wrapper), subclass the client and reassign the protected `_fetch`:

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

## Testing your code

Your tests don't need to fake HTTP. Have your code take a `CloudflareSaaS`
instance and pass in a stand-in that returns the shapes from
`@tundraconnect/cloudflare-saas/schemas` or throws a real `CloudflareSaaSError`:

```ts
import { CloudflareSaaSError } from '@tundraconnect/cloudflare-saas/errors';

const outage = new CloudflareSaaSError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(outage.code);
```

To exercise the client itself against a fake transport, subclass it and
reassign the protected `_fetch` (see Custom transport above).

## Documentation

| Topic                                                                               | Description                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/CloudflareSaaS-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/CloudflareSaaS-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/CloudflareSaaS-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [Cloudflare for SaaS](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/)
- [Custom hostnames API reference](https://developers.cloudflare.com/api/resources/custom_hostnames/)
- [Hostname validation](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/)
- [Custom hostname status codes](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/reference/status-codes/custom-hostnames/)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/cloudflare-saas
```

**Bun:**

```sh
bunx jsr add @tundraconnect/cloudflare-saas
```

**Node.js:**

```sh
npx jsr add @tundraconnect/cloudflare-saas
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
