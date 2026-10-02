# GoogleWebRisk Errors

Every failure from `@tundraconnect/google-web-risk` is a
`GoogleWebRiskError`. That includes timeouts, network failures and
response-validation failures, so one `instanceof` covers everything. Branch
on the readonly `code`, or on `transient` to separate "no verdict yet" from
a definite failure. Never branch on a message substring.

```ts
import { GoogleWebRiskError } from '@tundraconnect/google-web-risk/errors';

try {
  const verdict = await webRisk.search({ uri });
} catch (err) {
  if (err instanceof GoogleWebRiskError && err.transient) {
    // keep the link pending and look it up again later
  }
  throw err;
}
```

## Codes

| Code                       | Transient | Raised when                                                                        |
| -------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `CONFIG_INVALID_AUTH`      | no        | `auth` is missing, of another type, or carries a blank key/token.                  |
| `REQUEST_VALIDATION_ERROR` | no        | Blank `uri`, unknown or empty `threatTypes`, out-of-range `timeout`: nothing sent. |
| `TIMEOUT`                  | **yes**   | No complete answer within the deadline.                                            |
| `NETWORK_ERROR`            | **yes**   | `fetch` failed before any response (DNS, TLS, connection reset).                   |
| `SERVICE_UNAVAILABLE`      | **yes**   | HTTP 5xx.                                                                          |
| `RATE_LIMITED`             | **yes**   | HTTP 429 (`RESOURCE_EXHAUSTED`: quota or rate limit).                              |
| `AUTH_FAILED`              | no        | HTTP 401, or a 400 whose `ErrorInfo.reason` is `API_KEY_INVALID`.                  |
| `FORBIDDEN`                | no        | HTTP 403: API not enabled, billing disabled, or a key restricted from Web Risk.    |
| `INVALID_REQUEST`          | no        | Any other 4xx, e.g. a URI Web Risk refuses.                                        |
| `RESPONSE_ERROR`           | no        | A 2xx body that isn't a `uris:search` response.                                    |
| `UNKNOWN_ERROR`            | no        | Anything unmapped, or an unrecognized code passed to the constructor.              |

The transient set is also exported as `GOOGLE_WEB_RISK_TRANSIENT_CODES`.

A bad API key is a **400** from Google, not a 401. It is classified from the
`ErrorInfo` detail's `reason` (`API_KEY_INVALID`) before the status is
consulted, so it surfaces as `AUTH_FAILED` rather than `INVALID_REQUEST`.

## Context

| Key                 | Present on                 | Meaning                                                             |
| ------------------- | -------------------------- | ------------------------------------------------------------------- |
| `vendor`            | all                        | Always `'GoogleWebRisk'`.                                           |
| `status`            | vendor failures            | HTTP status code.                                                   |
| `detail`            | vendor failures            | Google's `error.message`, or `no detail` for a non-envelope body.   |
| `vendorStatus`      | vendor failures            | Google's canonical status, e.g. `INVALID_ARGUMENT`.                 |
| `vendorReason`      | vendor failures            | The `ErrorInfo` reason, e.g. `API_KEY_INVALID`, `SERVICE_DISABLED`. |
| `body`              | vendor failures            | The parsed response body.                                           |
| `retryAfterSeconds` | `RATE_LIMITED`             | The vendor's retry hint, when it sent one.                          |
| `timeoutSeconds`    | `TIMEOUT`                  | The deadline that was missed.                                       |
| `reason`            | `REQUEST_VALIDATION_ERROR` | Each failing field as `field: message`, joined by `;`.              |

The API key never appears in an error's message, context or cause chain. It
travels in a header that RESTler redacts, never in the URL. Google's error
bodies do not echo it.

---

[← Back to GoogleWebRisk](../README.md)
