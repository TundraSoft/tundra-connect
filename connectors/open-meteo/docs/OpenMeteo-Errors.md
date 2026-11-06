# OpenMeteo Errors

Every failure from `@tundraconnect/open-meteo` is an `OpenMeteoError`,
response-validation failures included. Branch on the readonly `code`, never
on message text; `transient` says whether trying again later can help.

```ts
import { OpenMeteoError } from '@tundraconnect/open-meteo/errors';

declare function fetchForecast(): Promise<unknown>;

try {
  await fetchForecast();
} catch (err) {
  if (err instanceof OpenMeteoError && err.transient) {
    console.log(
      'retry later',
      err.code,
      err.getContextValue('retryAfterSeconds'),
    );
  } else if (err instanceof OpenMeteoError && err.code === 'BAD_REQUEST') {
    console.log('Open-Meteo said:', err.getContextValue('reason'));
  } else {
    throw err;
  }
}
```

## Codes

| Code                     | When                                                                      | Transient |
| ------------------------ | ------------------------------------------------------------------------- | --------- |
| `CONFIG_INVALID_API_KEY` | `auth` given without a non-empty `apiKey`.                                | no        |
| `CONFIG_INVALID_HOST`    | A `hosts` entry is not an `https://` URL (or `http://localhost`).         | no        |
| `INVALID_REQUEST`        | Local validation: coordinates, dates, `run`, `previousDays`.              | no        |
| `INVALID_API_KEY`        | Open-Meteo refused the key (HTTP 400 with an API-key reason, 401 or 403). | no        |
| `BAD_REQUEST`            | HTTP 400: an unknown variable or model, an out-of-range date, ...         | no        |
| `NOT_FOUND`              | HTTP 404.                                                                 | no        |
| `RATE_LIMITED`           | HTTP 429, or RESTler's `maxRetryWait` retry ran out.                      | yes       |
| `SERVICE_UNAVAILABLE`    | HTTP 5xx.                                                                 | yes       |
| `TIMEOUT`                | No answer within `timeout`.                                               | yes       |
| `NETWORK_ERROR`          | DNS, TLS or connection failure before any response.                       | yes       |
| `RESPONSE_ERROR`         | A 2xx body that doesn't match the schema (e.g. a ragged series block).    | no        |
| `UNKNOWN_ERROR`          | Any other status.                                                         | no        |

## Context

`getContextValue()` exposes `status`, `reason` (Open-Meteo's own text),
`retryAfterSeconds`, `retried` (after a `maxRetryWait` retry), `body`,
`timeoutSeconds` and, for `RESPONSE_ERROR`, `responseError` (the Guardian
issue). The API key never appears in a message or in the context.
