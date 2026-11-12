# Deribit Errors

Every failure from `@tundraconnect/deribit` — REST or socket — is a
`DeribitError`. Branch on the readonly `code`; `transient` says whether
trying again later can help. Deribit's own JSON-RPC `code` and `message`
are kept as `vendorCode` / `vendorMessage`.

```ts
import { DeribitError } from '@tundraconnect/deribit/errors';

declare function loadChain(): Promise<unknown>;

try {
  await loadChain();
} catch (err) {
  if (err instanceof DeribitError && err.code === 'RATE_LIMITED') {
    console.log('slow down', err.getContextValue('vendorCode')); // 10028
  } else if (err instanceof DeribitError && err.transient) {
    console.log('retry later', err.code);
  } else {
    throw err;
  }
}
```

## REST codes

| Code                    | When                                                                            | Transient |
| ----------------------- | ------------------------------------------------------------------------------- | --------- |
| `CONFIG_INVALID_OPTION` | An unknown `environment` (or bad socket option).                                | no        |
| `INVALID_REQUEST`       | Local validation: a non-public `call()`, `source: 'history'` on testnet.        | no        |
| `BAD_REQUEST`           | A JSON-RPC error not listed below, e.g. `-32602 Invalid params`.                | no        |
| `NOT_FOUND`             | `-32601 Method not found`, or HTTP 404.                                         | no        |
| `UNAUTHORIZED`          | `13004`, `13009`, `13021`, `13778`, or HTTP 401/403.                            | no        |
| `RATE_LIMITED`          | `10028 too_many_requests`, HTTP 429, or RESTler's `maxRetryWait` retry ran out. | yes       |
| `SERVICE_UNAVAILABLE`   | `10040`, `13028`, `13888`, or HTTP 5xx.                                         | yes       |
| `TIMEOUT`               | No answer within `timeout`.                                                     | yes       |
| `NETWORK_ERROR`         | DNS, TLS or connection failure before any response.                             | yes       |
| `RESPONSE_ERROR`        | A result that doesn't match the schema.                                         | no        |
| `UNKNOWN_ERROR`         | Any other status.                                                               | no        |

`deribitErrorCode(vendorCode)` is the mapping, exported for your own use.

## Socket codes

| Code                                                                                                                                           | When                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `CONFIG_INVALID_AUTH`                                                                                                                          | `auth` isn't `{ type: 'CUSTOM', clientId, clientSecret }`.                |
| `CONFIG_RAW_REQUIRES_AUTH`                                                                                                                     | `interval: 'raw'` without `auth`.                                         |
| `SOCKET_AUTH_FAILED`                                                                                                                           | `public/auth` refused (fatal; not retried).                               |
| `SOCKET_SUBSCRIBE_FAILED`                                                                                                                      | A subscribe was refused; carries `vendorCode` and `channels` (non-fatal). |
| `SOCKET_VENUE_ERROR`                                                                                                                           | Any other request error, or a frame that isn't JSON.                      |
| `SOCKET_INVALID_MESSAGE`                                                                                                                       | Attached to an `invalid` event.                                           |
| `SOCKET_RECONNECT_EXHAUSTED`, `SOCKET_BUFFER_OVERFLOW`, `SOCKET_IN_USE`, `SOCKET_CLOSED`, `SOCKET_HANDLER_ERROR`, `SOCKET_UNSUPPORTED_RUNTIME` | The shared socket core's lifecycle codes.                                 |

## Context

`getContextValue()` exposes `status`, `vendorCode`, `vendorMessage`,
`vendorData` (Deribit's `data`, e.g. `{ reason, param }`),
`retryAfterSeconds`, `retried`, `timeoutSeconds`, and on socket errors
`feed`, `method`, `channels` and `detail`. Client secrets never appear in
an error.
