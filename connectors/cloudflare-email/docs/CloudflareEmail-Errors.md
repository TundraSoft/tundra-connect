# CloudflareEmail Errors

Every failure from `@tundraconnect/cloudflare-email` is a
`CloudflareEmailError`, including response-validation failures. Branch on
the readonly `code` property — never on a message substring.

```ts
import { CloudflareEmailError } from '@tundraconnect/cloudflare-email/errors';

try {
  await client.send(message);
} catch (err) {
  if (err instanceof CloudflareEmailError && err.code === 'RATE_LIMITED') {
    // back off and retry
  }
  throw err;
}
```

## Codes

| Code                        | Raised when                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| `CONFIG_INVALID_API_TOKEN`  | `auth` is missing, isn't `BEARER`, or its `token` is blank.                 |
| `CONFIG_INVALID_ACCOUNT_ID` | `accountId` is missing or blank.                                            |
| `REQUEST_VALIDATION_ERROR`  | `send` arguments failed local validation — nothing was sent.                |
| `INVALID_REQUEST`           | Cloudflare rejected the request body.                                       |
| `MESSAGE_TOO_LARGE`         | The encoded message exceeds Cloudflare's 5 MiB limit, attachments included. |
| `AUTH_FAILED`               | The API token is missing or invalid.                                        |
| `FORBIDDEN`                 | The token authenticates but lacks the Send Email permission.                |
| `ACCOUNT_NOT_ENTITLED`      | The account is not entitled to Email Sending (Workers Paid beta).           |
| `RATE_LIMITED`              | Cloudflare throttled the request.                                           |
| `SERVICE_UNAVAILABLE`       | Cloudflare returned a 5xx, or its internal-error code.                      |
| `RESPONSE_ERROR`            | A successful response's body did not match the expected schema.             |
| `UNKNOWN_ERROR`             | Any unmapped failure, or an unrecognized code passed to the constructor.    |

## Vendor code mapping

Cloudflare's documented numeric codes map one-for-one onto stable names, so
callers never need to hard-code an integer:

| Cloudflare code | HTTP | `code`                 |
| --------------- | ---- | ---------------------- |
| `10001`         | 400  | `INVALID_REQUEST`      |
| `10200`         | 400  | `MESSAGE_TOO_LARGE`    |
| `10101`         | 401  | `AUTH_FAILED`          |
| `10102`         | 403  | `FORBIDDEN`            |
| `10105`         | 403  | `ACCOUNT_NOT_ENTITLED` |
| `10004`         | 429  | `RATE_LIMITED`         |
| `10002`         | 500  | `SERVICE_UNAVAILABLE`  |

A response carrying no recognizable envelope — a gateway-level 502 serving
HTML, say — falls back to HTTP-status mapping. An unmapped numeric code
does the same, so a newly-introduced vendor code degrades to the right
status-level classification rather than to `UNKNOWN_ERROR`.

`success: false` on an HTTP 200 is treated as a failure. Cloudflare's
envelope carries its own success flag, and trusting the status alone would
hand back an empty `result` as though the mail had been sent.

## Diagnostic metadata

Read metadata with the public `getContextValue(key)`.

| Key            | Present on                      | Description                              |
| -------------- | ------------------------------- | ---------------------------------------- |
| `vendor`       | all                             | Always `'CloudflareEmail'`.              |
| `status`       | vendor failures                 | HTTP status code.                        |
| `detail`       | vendor failures                 | Vendor message plus its numeric code.    |
| `vendorCode`   | vendor failures carrying a code | Cloudflare's raw numeric code.           |
| `body`         | vendor failures                 | The parsed response body.                |
| `reason`       | `REQUEST_VALIDATION_ERROR`      | Which local rule failed.                 |
| `originalCode` | `UNKNOWN_ERROR` fallback        | The unrecognized code originally passed. |

The API token never appears in an error's message or context.

## Backing off after a 429

A rate-limited request throws `RATE_LIMITED`. Two context values tell you what to
do next:

| Context             | Meaning                                                                                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retryAfterSeconds` | Seconds the vendor asked you to wait, parsed by RESTler from `Retry-After` (delta seconds or an HTTP-date), `X-RateLimit-Reset-After`, `RateLimit-Reset`, or an epoch-seconds `X-RateLimit-Reset`. `undefined` when the response carried none — never a guess. |
| `retried`           | Set only when `maxRetryWait` is configured: `true` if RESTler already waited once and was throttled again, `false` if it did not wait (the hint exceeded the cap, or there was no hint to wait on).                                                            |

Nothing is retried by default. Opt in with two client options (seconds,
each `0`–`120`):

- **`maxRetryWait`** — when a 429 carries a hint no longer than this,
  RESTler waits that long and retries **once**; otherwise it throws
  `RATE_LIMITED` immediately. `0` disables the retry.
- **`defaultRetryWait`** — the wait used when a 429 carries **no** hint.
  Without it a hintless 429 is never retried: RESTler does not invent a
  delay. Only consulted when `maxRetryWait` is set, and still capped by it.

---

[← Back to CloudflareEmail](../README.md)
