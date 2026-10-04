# CloudflareTurnstile Errors

Every failure from `@tundraconnect/cloudflare-turnstile` is a
`CloudflareTurnstileError`. That includes timeouts, network failures and
response-validation failures, so one `instanceof` covers everything. Branch
on the readonly `code`, or on `transient` to separate "no verdict yet" from
a definite failure. Never branch on a message substring.

A failed challenge is **not** an error. `verify` resolves it as
`{ success: false, 'error-codes': [...] }`.

```ts
import { CloudflareTurnstileError } from '@tundraconnect/cloudflare-turnstile/errors';

declare function verifyTheToken(): Promise<unknown>;

try {
  await verifyTheToken();
} catch (err) {
  if (err instanceof CloudflareTurnstileError && err.transient) {
    // ask the visitor to try again, or fail open — your call
  }
  throw err;
}
```

## Codes

| Code                        | Transient | Raised when                                                                                                                                   |
| --------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_INVALID_SECRET_KEY` | no        | `auth` is missing, isn't `CUSTOM`, or carries a blank `secretKey`.                                                                            |
| `REQUEST_VALIDATION_ERROR`  | no        | A blank or over-long `response`, a blank `remoteip` / `idempotency_key`, a malformed expectation, or an out-of-range `timeout`: nothing sent. |
| `AUTH_FAILED`               | no        | `missing-input-secret` / `invalid-input-secret` in the body, or HTTP 401 / 403.                                                               |
| `INVALID_REQUEST`           | no        | `bad-request` / `missing-input-response` in the body, or any other 4xx.                                                                       |
| `TIMEOUT`                   | **yes**   | No complete answer within the deadline.                                                                                                       |
| `NETWORK_ERROR`             | **yes**   | `fetch` failed before any response (DNS, TLS, connection reset).                                                                              |
| `SERVICE_UNAVAILABLE`       | **yes**   | `internal-error` in the body, or HTTP 5xx.                                                                                                    |
| `RATE_LIMITED`              | **yes**   | HTTP 429.                                                                                                                                     |
| `RESPONSE_ERROR`            | no        | A body without a boolean `success`, or one that fails the verdict schema.                                                                     |
| `UNKNOWN_ERROR`             | no        | An unrecognised code passed in.                                                                                                               |

The transient set is also exported as `CLOUDFLARE_TURNSTILE_TRANSIENT_CODES`.

## Context

| Key                 | Present on                                   | Meaning                                                                    |
| ------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| `vendor`            | all                                          | Always `'CloudflareTurnstile'`.                                            |
| `status`            | vendor failures                              | HTTP status code (200 for an in-body refusal).                             |
| `vendorCodes`       | vendor failures                              | The body's `error-codes`, comma-joined, or `none`.                         |
| `body`              | vendor failures                              | The parsed response body.                                                  |
| `retryAfterSeconds` | `RATE_LIMITED`                               | The vendor's retry hint, when it sent one.                                 |
| `retried`           | `RATE_LIMITED`                               | Whether RESTler already waited and retried once (`maxRetryWait`).          |
| `timeoutSeconds`    | `TIMEOUT`                                    | The deadline that was missed.                                              |
| `reason`            | `REQUEST_VALIDATION_ERROR`                   | Which field failed and why, e.g. `response: \`response\` cannot be empty`. |
| `responseError`     | `RESPONSE_ERROR`, `REQUEST_VALIDATION_ERROR` | The Guardian error, serialised.                                            |

The secret key never appears in an error's message, context or cause chain.

---

[← Back to CloudflareTurnstile](../README.md)
