# OpenExchange Errors

OpenExchange throws `OpenExchangeError` for invalid configuration, documented vendor responses, and malformed payloads.

```ts
import {
  OpenExchangeError,
  OpenExchangeErrorCodes,
} from '@tundraconnect/openexchange/errors';

const error = new OpenExchangeError('INVALID_APP_ID');
console.log(error.message);
console.log(OpenExchangeErrorCodes.INVALID_APP_ID);
```

## Codes

| Code                           | Meaning                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `CONFIG_INVALID_APP_ID`        | The configured application ID is blank.                                            |
| `CONFIG_INVALID_BASE_CURRENCY` | The base currency is not three characters.                                         |
| `INVALID_DATE`                 | A historical date failed local validation (not `YYYY-MM-DD`); no request was sent. |
| `MISSING_APP_ID`               | Open Exchange Rates returned `missing_app_id`.                                     |
| `INVALID_APP_ID`               | Open Exchange Rates returned `invalid_app_id`.                                     |
| `NOT_ALLOWED`                  | The plan or rate limit does not permit the request.                                |
| `NOT_FOUND`                    | The requested resource was not found.                                              |
| `RESPONSE_ERROR`               | A vendor response was malformed or unrecognised.                                   |
| `SERVICE_UNAVAILABLE`          | An undocumented server-side (5xx) error response.                                  |
| `UNKNOWN_ERROR`                | An undocumented client-error (4xx) status, or an unknown constructor code.         |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof OpenExchangeError && error.code === 'NOT_FOUND') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`, `status`, or `originalCode`.

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

[← Back to OpenExchange](../README.md)

## Rate limiting

| Code           | Raised when                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `RATE_LIMITED` | HTTP 429. Read `retryAfterSeconds` from the error context and back off; never retry immediately. |
