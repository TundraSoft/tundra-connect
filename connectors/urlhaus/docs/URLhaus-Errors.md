# URLhaus Errors

Every failure from `@tundraconnect/urlhaus` is a `URLhausError`. That
includes timeouts, network failures and response-validation failures, so
one `instanceof` covers everything. Branch on the readonly `code`, or on
`transient` to separate "no verdict yet" from a definite failure. Never
branch on a message substring.

A lookup that finds nothing is **not** an error. It resolves to
`{ listed: false }` / `{ found: false }`.

```ts
import { URLhausError } from '@tundraconnect/urlhaus/errors';

try {
  const verdict = await urlhaus.lookupUrl({ url });
} catch (err) {
  if (err instanceof URLhausError && err.transient) {
    // keep the link pending and look it up again later
  }
  throw err;
}
```

## Codes

| Code                       | Transient | Raised when                                                                              |
| -------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| `CONFIG_INVALID_AUTH`      | no        | `auth` is missing, isn't `CUSTOM`, or carries a blank `authKey`.                         |
| `REQUEST_VALIDATION_ERROR` | no        | A blank argument, malformed hash or id, or out-of-range `limit`/`timeout`: nothing sent. |
| `INVALID_URL`              | no        | `query_status: invalid_url`.                                                             |
| `INVALID_HOST`             | no        | `query_status: invalid_host`.                                                            |
| `INVALID_HASH`             | no        | `query_status: invalid_md5` or `invalid_sha256`.                                         |
| `AUTH_FAILED`              | no        | HTTP 401 (no key), or `unknown_auth_key` (HTTP 403, an unrecognized key).                |
| `FORBIDDEN`                | no        | Any other HTTP 403.                                                                      |
| `INVALID_REQUEST`          | no        | `http_post_expected` / `http_get_expected` (HTTP 405), or any other 4xx.                 |
| `TIMEOUT`                  | **yes**   | No complete answer within the deadline.                                                  |
| `NETWORK_ERROR`            | **yes**   | `fetch` failed before any response (DNS, TLS, connection reset).                         |
| `SERVICE_UNAVAILABLE`      | **yes**   | HTTP 5xx.                                                                                |
| `RATE_LIMITED`             | **yes**   | HTTP 429.                                                                                |
| `RESPONSE_ERROR`           | no        | A body without `query_status`, or an `ok` body of the wrong shape.                       |
| `UNKNOWN_ERROR`            | no        | An undocumented `query_status` on a 2xx, or an unrecognized code passed in.              |

The transient set is also exported as `URLHAUS_TRANSIENT_CODES`.

`query_status` is consulted before the HTTP status. The live API answers a
wrong key with a 403 carrying `unknown_auth_key`, so it is classified as
`AUTH_FAILED` rather than `FORBIDDEN`.

## Context

| Key                 | Present on                 | Meaning                                                                 |
| ------------------- | -------------------------- | ----------------------------------------------------------------------- |
| `vendor`            | all                        | Always `'URLhaus'`.                                                     |
| `status`            | vendor failures            | HTTP status code (200 for a `query_status` refusal).                    |
| `vendorStatus`      | vendor failures            | URLhaus's `query_status`, or `none` when the body carried none.         |
| `body`              | vendor failures            | The parsed response body.                                               |
| `retryAfterSeconds` | `RATE_LIMITED`             | The vendor's retry hint, when it sent one.                              |
| `timeoutSeconds`    | `TIMEOUT`                  | The deadline that was missed.                                           |
| `reason`            | `REQUEST_VALIDATION_ERROR` | Which field failed and why, e.g. `md5_hash: must be 32 hex characters`. |

The Auth-Key never appears in an error's message, context or cause chain.

---

[← Back to URLhaus](../README.md)
