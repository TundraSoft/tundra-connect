# Binance Errors

Everything in this connect raises `BinanceError` — see
[errors/Base.ts](../errors/Base.ts) and
[errors/BinanceErrorCodes.ts](../errors/BinanceErrorCodes.ts).

```ts
import { BinanceError, BinanceErrorCodes } from '@tundraconnect/binance/errors';

const error = new BinanceError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(error.message, BinanceErrorCodes.SERVICE_UNAVAILABLE);
```

## Socket codes

`BinanceMarketSocket` reports these through `error` and `invalid` events
rather than by throwing — only `connect()` after `close()` (`SOCKET_CLOSED`)
and a second concurrent iterator (`SOCKET_IN_USE`) throw. A `fatal: true`
error event means the socket has closed for good.

| Code                         | Meaning                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `SOCKET_GEO_BLOCKED`         | The host answered HTTP 451/403: this region is blocked. Fatal; `status` and `url` in the context.    |
| `SOCKET_VENUE_ERROR`         | A Binance error reply to a request (`venueCode`, `requestId`).                                       |
| `SOCKET_INVALID_MESSAGE`     | A known message failed schema validation (carried by an `invalid` event with the data).              |
| `SOCKET_RECONNECT_EXHAUSTED` | `reconnect.maxAttempts` consecutive attempts failed, or `reconnect: false` and the connection ended. |
| `SOCKET_BUFFER_OVERFLOW`     | More than `maxBufferedEvents` events went unread; the socket closed rather than drop any.            |
| `SOCKET_UNSUPPORTED_RUNTIME` | No usable global `WebSocket`; pass a `webSocket` factory.                                            |
| `SOCKET_HANDLER_ERROR`       | An unexpected exception while handling a frame or opening a session; reported, not fatal.            |
| `SOCKET_IN_USE`              | A second iterator was requested while one is active.                                                 |
| `SOCKET_CLOSED`              | `connect()` was called on a closed socket.                                                           |

## General codes

| Code                  | Meaning                       |
| --------------------- | ----------------------------- |
| `UNKNOWN_ERROR`       | An unknown code was supplied. |
| `INVALID_REQUEST`     | Reserved for the REST client. |
| `RESPONSE_ERROR`      | Reserved for the REST client. |
| `SERVICE_UNAVAILABLE` | Reserved for the REST client. |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
import { BinanceError } from '@tundraconnect/binance/errors';

declare const error: unknown;
if (error instanceof BinanceError && error.code === 'SOCKET_GEO_BLOCKED') {
  console.log(error.getContextValue('status'));
}
```

---

[← Back to Binance](../README.md)
