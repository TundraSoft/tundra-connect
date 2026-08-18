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

---

[← Back to OpenWeatherMap](../README.md)
