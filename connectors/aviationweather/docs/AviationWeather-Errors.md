# AviationWeather Errors

Every failure from `@tundraconnect/aviationweather` is an
`AviationWeatherError`. Branch on the readonly `code`; `transient` says
whether trying again later can help.

```ts
import { AviationWeatherError } from '@tundraconnect/aviationweather/errors';

declare function poll(): Promise<unknown>;

try {
  await poll();
} catch (err) {
  if (err instanceof AviationWeatherError && err.code === 'RATE_LIMITED') {
    console.log('over 100/min — slow down');
  } else if (err instanceof AviationWeatherError && err.transient) {
    console.log('retry later', err.code);
  } else {
    throw err;
  }
}
```

## Codes

| Code                        | When                                                                                       | Transient |
| --------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| `CONFIG_INVALID_RATE_LIMIT` | `rateLimit` isn't `false` or positive integers.                                            | no        |
| `INVALID_REQUEST`           | Local validation: no `ids`/`bbox`, a bad `hours`, `date`, `bbox`, `time`.                  | no        |
| `BAD_REQUEST`               | HTTP 400 — an invalid or undocumented parameter (`reason` has the text).                   | no        |
| `FORBIDDEN`                 | HTTP 403 — the endpoint is restricted or the client is blocked.                            | no        |
| `NOT_FOUND`                 | HTTP 404.                                                                                  | no        |
| `RATE_LIMITED`              | HTTP 429, or RESTler's `maxRetryWait` retry ran out.                                       | yes       |
| `SERVICE_UNAVAILABLE`       | HTTP 5xx (500, 502, 504).                                                                  | yes       |
| `TIMEOUT`                   | No answer within `timeout`.                                                                | yes       |
| `NETWORK_ERROR`             | DNS, TLS or connection failure before any response.                                        | yes       |
| `RESPONSE_ERROR`            | A body that doesn't match the schema, or a cache file that isn't the expected gzipped CSV. | no        |
| `UNKNOWN_ERROR`             | Any other status.                                                                          | no        |

A `204 No Content` is not an error: it returns `[]`.

## Context

`getContextValue()` exposes `status`, `reason` (the service's `error`
text), `body`, `retryAfterSeconds`, `retried`, `timeoutSeconds` and, for
`RESPONSE_ERROR`, `responseError`.
