# Pyth Errors

Everything in this connect raises `PythError` — see
[errors/Base.ts](../errors/Base.ts) and
[errors/PythErrorCodes.ts](../errors/PythErrorCodes.ts).

```ts
import { PythError } from '@tundraconnect/pyth/errors';

const error = new PythError('SOCKET_MISSING_CREDENTIALS');
console.log(error.code, error.message);
```

## Socket codes

The constructor throws `SOCKET_MISSING_CREDENTIALS` and
`SOCKET_INVALID_SUBSCRIPTION`; `subscribe()` throws the latter too. Everything
else arrives as an `error` (or `invalid`) event tagged with its `endpoint`; a
`fatal: true` error means that endpoint stopped for good.

| Code                          | Meaning                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `SOCKET_MISSING_CREDENTIALS`  | No access token in `auth.token`.                                                        |
| `SOCKET_INVALID_SUBSCRIPTION` | A subscription names no feeds, or `endpoints` is empty.                                 |
| `SOCKET_VENUE_ERROR`          | A Pyth `error` or `subscriptionError` reply (`subscriptionId` in the context).          |
| `SOCKET_INVALID_MESSAGE`      | A frame failed schema validation (carried by an `invalid` event with the data).         |
| `SOCKET_RECONNECT_EXHAUSTED`  | An endpoint used up `reconnect.maxAttempts`, or `reconnect: false` and it disconnected. |
| `SOCKET_BUFFER_OVERFLOW`      | An endpoint buffered more than `maxBufferedEvents` unread events and closed.            |
| `SOCKET_UNSUPPORTED_RUNTIME`  | No usable global `WebSocket`; pass a `webSocket` factory.                               |
| `SOCKET_HANDLER_ERROR`        | An unexpected exception while handling a frame; reported, not fatal.                    |
| `SOCKET_IN_USE`               | A second iterator was requested while one is active.                                    |
| `SOCKET_CLOSED`               | `connect()` was called on a closed socket.                                              |

The generic `UNKNOWN_ERROR`, `INVALID_REQUEST`, `RESPONSE_ERROR` and
`SERVICE_UNAVAILABLE` are reserved for the REST clients.

---

[← Back to Pyth](../README.md)
