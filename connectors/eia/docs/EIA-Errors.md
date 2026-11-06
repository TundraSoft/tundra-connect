# EIA Errors

Every failure from `@tundraconnect/eia` is an `EIAError`. Branch on the
readonly `code`; `transient` says whether trying again later can help.

```ts
import { EIAError } from '@tundraconnect/eia/errors';

declare function readStocks(): Promise<unknown>;

try {
  await readStocks();
} catch (err) {
  if (err instanceof EIAError && err.code === 'INVALID_API_KEY') {
    console.log('key problem:', err.getContextValue('vendorCode'));
  } else if (err instanceof EIAError && err.transient) {
    console.log('retry later', err.code);
  } else {
    throw err;
  }
}
```

## Codes

| Code                     | When                                                                                                             | Transient |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------- |
| `CONFIG_INVALID_API_KEY` | `auth` missing or its `apiKey` empty.                                                                            | no        |
| `INVALID_REQUEST`        | Local validation: a malformed route, facet or series id, `length`, `offset` or `pageSize`.                       | no        |
| `INVALID_API_KEY`        | HTTP 401/403 or a gateway `API_KEY_MISSING` / `API_KEY_INVALID`.                                                 | no        |
| `BAD_REQUEST`            | HTTP 400: an unknown frequency, facet or column.                                                                 | no        |
| `NOT_FOUND`              | HTTP 404: no such route.                                                                                         | no        |
| `RATE_LIMITED`           | HTTP 429 / `OVER_RATE_LIMIT` (including a temporarily suspended key), or RESTler's `maxRetryWait` retry ran out. | yes       |
| `SERVICE_UNAVAILABLE`    | HTTP 5xx.                                                                                                        | yes       |
| `TIMEOUT`                | No answer within `timeout`.                                                                                      | yes       |
| `NETWORK_ERROR`          | DNS, TLS or connection failure before any response.                                                              | yes       |
| `RESPONSE_ERROR`         | A 2xx body that doesn't match the schema.                                                                        | no        |
| `UNKNOWN_ERROR`          | Any other status.                                                                                                | no        |

## Context

`getContextValue()` exposes `status`, `vendorCode` (the API gateway's code,
when it sent one), `reason` (EIA's message), `retryAfterSeconds`,
`retried`, `timeoutSeconds` and, for `RESPONSE_ERROR`, `responseError`. The
API key never appears in a message or in the context.
