# CloudflareSaaS Errors

Every failure from `@tundraconnect/cloudflare-saas` is a
`CloudflareSaaSError`, response-validation failures included, so one
`instanceof` covers everything. Branch on the readonly `code`, never on a
message substring.

```ts
import { CloudflareSaaSError } from '@tundraconnect/cloudflare-saas/errors';

declare function attachDomain(): Promise<unknown>;

try {
  await attachDomain();
} catch (err) {
  if (err instanceof CloudflareSaaSError) {
    switch (err.code) {
      case 'DUPLICATE_HOSTNAME': // already attached — look it up
      case 'INVALID_HOSTNAME': // tell the customer what Cloudflare said
      case 'QUOTA_EXCEEDED': // raise the zone's allocation
        console.log(err.code, err.getContextValue('detail'));
    }
  }
  throw err;
}
```

## Codes

| Code                       | Raised when                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_INVALID_API_TOKEN` | `auth` is missing, isn't `BEARER`, or carries a blank `token`.                                                                                                 |
| `CONFIG_INVALID_ZONE_ID`   | `zoneId` is missing, blank or not an identifier.                                                                                                               |
| `REQUEST_VALIDATION_ERROR` | A hostname, `ssl` block, filter or id fails local validation, or an update names no field: nothing sent.                                                       |
| `INVALID_HOSTNAME`         | Cloudflare codes 1407–1411 (the hostname) or 1415–1421 (the custom origin hostname).                                                                           |
| `DUPLICATE_HOSTNAME`       | Code 1406 — and only that code.                                                                                                                                |
| `QUOTA_EXCEEDED`           | Codes 1404 (no quota allocated) and 1405 (quota exceeded).                                                                                                     |
| `INVALID_REQUEST`          | Any other 14xx code (bad JSON, bad `ssl` attribute, invalid id, 1439 "modifying not supported", …), or any other 4xx, including a 409 with no recognised code. |
| `AUTH_FAILED`              | Codes 1000–1005, 1403, 6111, 9103, 9106, 9109, 10000 (on a non-403), or HTTP 401.                                                                              |
| `FORBIDDEN`                | Codes 1413 / 1414 (an entitlement the plan lacks), 10000 on HTTP 403, or any other HTTP 403.                                                                   |
| `NOT_FOUND`                | Codes 1436 (hostname), 1431 (custom CSR), 7000 / 7003 (no such route — an unknown zone id), or HTTP 404.                                                       |
| `TIMEOUT`                  | No answer within the client's `timeout`.                                                                                                                       |
| `NETWORK_ERROR`            | `fetch` failed before any response (DNS, TLS, connection reset).                                                                                               |
| `RATE_LIMITED`             | HTTP 429, or RESTler's single retry (`maxRetryWait`) was exhausted.                                                                                            |
| `SERVICE_UNAVAILABLE`      | Code 1500 or HTTP 5xx.                                                                                                                                         |
| `RESPONSE_ERROR`           | A success body that fails the endpoint's schema.                                                                                                               |
| `UNKNOWN_ERROR`            | An unrecognised code passed in, or a failure with no classifiable status.                                                                                      |

Cloudflare's numeric code is consulted first (including any `error_chain`),
then the 14xx range, then the HTTP status. `success: false` on a 2xx is a
failure too. The full list of Cloudflare's codes is in its
[status codes reference](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/reference/status-codes/custom-hostnames/).

## Transient failures

`err.transient` is `true` for `TIMEOUT`, `NETWORK_ERROR`,
`SERVICE_UNAVAILABLE` and `RATE_LIMITED`: Cloudflare could not be reached
or asked you to back off, and the same call may succeed later. It is
`false` for everything else — a refusal or a misconfiguration that
retrying will not fix. The set is exported as `CLOUDFLARE_SAAS_TRANSIENT_CODES`.

```ts
import { CloudflareSaaSError } from '@tundraconnect/cloudflare-saas/errors';

declare function callCloudflare(): Promise<unknown>;

try {
  await callCloudflare();
} catch (err) {
  if (err instanceof CloudflareSaaSError && err.transient) {
    // unreachable for now: schedule a retry
  } else {
    throw err;
  }
}
```

## Context

| Key                 | Present on                                   | Meaning                                                                                                |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `vendor`            | all                                          | Always `'CloudflareSaaS'`.                                                                             |
| `status`            | vendor failures                              | HTTP status code.                                                                                      |
| `vendorCode`        | vendor failures                              | Cloudflare's numeric code from the first `errors` entry, when present.                                 |
| `detail`            | vendor failures                              | `<message> (code <n>)` from the first `errors` entry, or `no detail`.                                  |
| `body`              | vendor failures                              | The parsed response body.                                                                              |
| `retryAfterSeconds` | `RATE_LIMITED`                               | The vendor's retry hint, when it sent one.                                                             |
| `retried`           | `RATE_LIMITED`                               | Whether RESTler already waited and retried once (`maxRetryWait`).                                      |
| `reason`            | `REQUEST_VALIDATION_ERROR`                   | Which field failed and why, e.g. `hostname: \`hostname\` must be a hostname such as app.customer.com`. |
| `responseError`     | `RESPONSE_ERROR`, `REQUEST_VALIDATION_ERROR` | The Guardian error, serialised.                                                                        |

The API token never appears in an error's message, context or cause chain.

---

[← Back to CloudflareSaaS](../README.md)
