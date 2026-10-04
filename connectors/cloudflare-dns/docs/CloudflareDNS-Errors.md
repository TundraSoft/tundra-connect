# CloudflareDNS Errors

Every failure from `@tundraconnect/cloudflare-dns` is a `CloudflareDNSError`,
response-validation failures included, so one `instanceof` covers
everything. Branch on the readonly `code`, never on a message substring.

```ts
import { CloudflareDNSError } from '@tundraconnect/cloudflare-dns/errors';

declare function changeDns(): Promise<unknown>;

try {
  await changeDns();
} catch (err) {
  if (err instanceof CloudflareDNSError && err.code === 'RECORD_CONFLICT') {
    // the record is already there — look it up instead
  }
  throw err;
}
```

## Codes

| Code                       | Raised when                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `CONFIG_INVALID_API_TOKEN` | `auth` is missing, isn't `BEARER`, or carries a blank `token`.                                              |
| `CONFIG_INVALID_ZONE_ID`   | A `zoneId` option is given but blank or not an identifier.                                                  |
| `REQUEST_VALIDATION_ERROR` | A record, filter or id fails local validation, or no zone id is available: nothing sent.                    |
| `INVALID_REQUEST`          | Cloudflare code 1004 (DNS validation error), or any other 4xx with no recognised code.                      |
| `AUTH_FAILED`              | Cloudflare codes 6111, 9103, 9106, 9109, 10000 (on a non-403), or HTTP 401.                                 |
| `FORBIDDEN`                | Code 10000 on HTTP 403 (token lacks the permission), or any other HTTP 403.                                 |
| `NOT_FOUND`                | Code 81044 (record does not exist), 7000 / 7003 (no such route — an unknown zone id), or HTTP 404.          |
| `RECORD_CONFLICT`          | Codes 81053 (A/AAAA/CNAME with that host exists), 81056 (NS exists), 81057 (identical record), or HTTP 409. |
| `TIMEOUT`                  | No answer within the client's `timeout`.                                                                    |
| `NETWORK_ERROR`            | `fetch` failed before any response (DNS, TLS, connection reset).                                            |
| `RATE_LIMITED`             | HTTP 429, or RESTler's single retry (`maxRetryWait`) was exhausted.                                         |
| `SERVICE_UNAVAILABLE`      | HTTP 5xx.                                                                                                   |
| `RESPONSE_ERROR`           | A success body that fails the endpoint's schema.                                                            |
| `UNKNOWN_ERROR`            | An unrecognised code passed in, or a failure with no classifiable status.                                   |

Cloudflare's numeric code is consulted first (including any `error_chain`),
then the HTTP status. `success: false` on a 2xx is a failure too.

## Transient failures

`err.transient` is `true` for `TIMEOUT`, `NETWORK_ERROR`,
`SERVICE_UNAVAILABLE` and `RATE_LIMITED`: Cloudflare could not be reached
or asked you to back off, and the same call may succeed later. It is
`false` for everything else — a refusal or a misconfiguration that
retrying will not fix. The set is exported as `CLOUDFLARE_DNS_TRANSIENT_CODES`.

```ts
import { CloudflareDNSError } from '@tundraconnect/cloudflare-dns/errors';

declare function callCloudflare(): Promise<unknown>;

try {
  await callCloudflare();
} catch (err) {
  if (err instanceof CloudflareDNSError && err.transient) {
    // unreachable for now: schedule a retry
  } else {
    throw err;
  }
}
```

## Context

| Key                 | Present on                                   | Meaning                                                                                                |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `vendor`            | all                                          | Always `'CloudflareDNS'`.                                                                              |
| `status`            | vendor failures                              | HTTP status code.                                                                                      |
| `vendorCode`        | vendor failures                              | Cloudflare's numeric code from the first `errors` entry, when present.                                 |
| `detail`            | vendor failures                              | `<message> (code <n>)` from the first `errors` entry, or `no detail`.                                  |
| `body`              | vendor failures                              | The parsed response body.                                                                              |
| `retryAfterSeconds` | `RATE_LIMITED`                               | The vendor's retry hint, when it sent one.                                                             |
| `retried`           | `RATE_LIMITED`                               | Whether RESTler already waited and retried once (`maxRetryWait`).                                      |
| `reason`            | `REQUEST_VALIDATION_ERROR`                   | Which field failed and why, e.g. `ttl: \`ttl\` must be 1 (automatic) or between 30 and 86400 seconds`. |
| `responseError`     | `RESPONSE_ERROR`, `REQUEST_VALIDATION_ERROR` | The Guardian error, serialised.                                                                        |

The API token never appears in an error's message, context or cause chain.

---

[← Back to CloudflareDNS](../README.md)
