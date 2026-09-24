# OpenWeatherMap Errors

OpenWeatherMap throws `OpenWeatherMapError` for invalid configuration,
vendor error responses, and malformed payloads.

```ts
import {
  OpenWeatherMapError,
  OpenWeatherMapErrorCodes,
} from '@tundraconnect/openweathermap/errors';

const error = new OpenWeatherMapError('INVALID_API_KEY', { status: 401 });
console.log(error.message);
console.log(OpenWeatherMapErrorCodes.INVALID_API_KEY);
```

## Codes

OpenWeatherMap doesn't publish machine-readable error codes — its API only
returns a free-text `message` alongside an HTTP status code (and the same
status echoed back, inconsistently typed, in a `cod` field). Because of
that, error mapping keys off the **HTTP status code** the vendor returned
rather than the `message` text, and these codes are connect-specific:

| Code                     | HTTP status | Meaning                                                                                |
| ------------------------ | ----------- | -------------------------------------------------------------------------------------- |
| `CONFIG_INVALID_API_KEY` | —           | The configured API key is blank.                                                       |
| `INVALID_REQUEST`        | —           | Local validation failed before a request was sent (e.g. no location variant supplied). |
| `INVALID_API_KEY`        | 401         | OpenWeatherMap rejected the configured API key.                                        |
| `BAD_REQUEST`            | 400         | OpenWeatherMap rejected the request as invalid.                                        |
| `LOCATION_NOT_FOUND`     | 404         | The requested location could not be found.                                             |
| `RATE_LIMITED`           | 429         | OpenWeatherMap rate limit exceeded.                                                    |
| `SERVICE_UNAVAILABLE`    | 5xx         | A server-side error response.                                                          |
| `RESPONSE_ERROR`         | —           | A successful-looking response body was malformed.                                      |
| `UNKNOWN_ERROR`          | other 4xx   | An undocumented client-error status, or an unknown constructor code was supplied.      |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof OpenWeatherMapError && error.code === 'RATE_LIMITED') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, `body`, or the vendor's free-text `vendorMessage`.

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

[← Back to OpenWeatherMap](../README.md)
