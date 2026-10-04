# GoogleAnalytics Errors

Every failure from `@tundraconnect/google-analytics` is a
`GoogleAnalyticsError`, transport and response failures included. Branch
on the readonly `code`, or on `transient` for "retry later". Never branch
on a message substring.

The Measurement Protocol answers `2xx` even for payloads it drops, so most
mistakes surface as `REQUEST_VALIDATION_ERROR` (caught locally) or as
`validationMessages` from `validate()`, not as HTTP errors.

```ts
import { GoogleAnalyticsError } from '@tundraconnect/google-analytics/errors';

declare function sendTheEvents(): Promise<unknown>;

try {
  await sendTheEvents();
} catch (err) {
  if (err instanceof GoogleAnalyticsError && err.transient) {
    // queue the events and send them again later
  } else {
    throw err;
  }
}
```

## Codes

| Code                       | Transient | Raised when                                                           |
| -------------------------- | --------- | --------------------------------------------------------------------- |
| `CONFIG_INVALID_AUTH`      | no        | `auth` is missing, isn't `CUSTOM`, or carries a blank `apiSecret`.    |
| `CONFIG_INVALID_STREAM`    | no        | Neither or both of `measurementId` / `firebaseAppId`, or a blank one. |
| `CONFIG_INVALID_REGION`    | no        | `region` is not `'global'` or `'eu'`.                                 |
| `REQUEST_VALIDATION_ERROR` | no        | The payload breaks a GA4 rule (see the API page): nothing sent.       |
| `INVALID_REQUEST`          | no        | HTTP 4xx other than 401/403/429.                                      |
| `AUTH_FAILED`              | no        | HTTP 401 or 403.                                                      |
| `TIMEOUT`                  | **yes**   | No answer within the client's `timeout`.                              |
| `NETWORK_ERROR`            | **yes**   | `fetch` failed before any response (DNS, TLS, connection reset).      |
| `SERVICE_UNAVAILABLE`      | **yes**   | HTTP 5xx.                                                             |
| `RATE_LIMITED`             | **yes**   | HTTP 429, or RESTler's single retry (`maxRetryWait`) was exhausted.   |
| `RESPONSE_ERROR`           | no        | The debug endpoint's body is not `{ validationMessages: [...] }`.     |
| `UNKNOWN_ERROR`            | no        | An unrecognised code passed in.                                       |

The transient set is exported as `GOOGLE_ANALYTICS_TRANSIENT_CODES`.

## Context

| Key                 | Present on                 | Meaning                                                           |
| ------------------- | -------------------------- | ----------------------------------------------------------------- |
| `vendor`            | all                        | Always `'GoogleAnalytics'`.                                       |
| `status`            | HTTP failures              | HTTP status code.                                                 |
| `retryAfterSeconds` | `RATE_LIMITED`             | The vendor's retry hint, when it sent one.                        |
| `retried`           | `RATE_LIMITED`             | Whether RESTler already waited and retried once (`maxRetryWait`). |
| `timeoutSeconds`    | `TIMEOUT`                  | The timeout that was missed.                                      |
| `reason`            | `REQUEST_VALIDATION_ERROR` | Every rule the payload breaks, `;`-separated.                     |
| `responseError`     | `RESPONSE_ERROR`           | The Guardian error, serialised.                                   |

The API secret never appears in an error's message, context or cause chain.

---

[← Back to GoogleAnalytics](../README.md)
