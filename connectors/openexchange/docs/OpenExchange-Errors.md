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

---

[← Back to OpenExchange](../README.md)

## Backing off after a 429

`getContextValue('retryAfterSeconds')` — seconds to wait before retrying, parsed by RESTler (`_parseRetryAfter`) from `Retry-After` (delta seconds or an HTTP-date), `X-RateLimit-Reset-After`, `RateLimit-Reset`, or an epoch-seconds `X-RateLimit-Reset`; `undefined` when none was present — never a guess. Pass `maxRetryWait` (seconds) at construction to have RESTler wait the hinted time and retry **once**; if that attempt is throttled too, or the hint exceeds the cap, the error is raised with `retried` set so you know whether a wait already happened. Present on `RATE_LIMITED`.

## Rate limiting

| Code           | Raised when                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `RATE_LIMITED` | HTTP 429. Read `retryAfterSeconds` from the error context and back off; never retry immediately. |
