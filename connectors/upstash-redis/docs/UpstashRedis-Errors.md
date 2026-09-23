# UpstashRedis Errors

`UpstashRedis` throws `UpstashRedisError` for local request validation and
vendor responses — see [errors/Base.ts](../errors/Base.ts) and
[errors/UpstashRedisErrorCodes.ts](../errors/UpstashRedisErrorCodes.ts).

```ts
import {
  UpstashRedisError,
  UpstashRedisErrorCodes,
} from '@tundraconnect/upstash-redis/errors';

const error = new UpstashRedisError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(error.message);
```

## Codes

| Code                       | Meaning                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UNKNOWN_ERROR`            | An unmapped HTTP status was returned, or an unknown code was supplied to the constructor.                                                                                                                                                                                                                                                                   |
| `CONFIG_INVALID_TOKEN`     | `auth` is missing, isn't `type: 'BEARER'`, or its `token` is blank/not a string. Thrown at construction time.                                                                                                                                                                                                                                               |
| `REQUEST_VALIDATION_ERROR` | A command array (built internally, or passed to `execute()`/`pipeline()`) failed local Guardian validation and was never sent — `error.cause` is a `GuardianError`.                                                                                                                                                                                         |
| `INVALID_REQUEST`          | A local business-rule check failed before any request was sent — `SET`'s `ex`+`px` or `nx`+`xx` both set, or an empty key/value/field list for `del`/`exists`/`hset`/`lpush`/`rpush`. Carries the reason in `error.getContextValue('reason')`.                                                                                                              |
| `AUTH_FAILED`              | UpstashRedis returned HTTP `401` — the Bearer token is missing or invalid.                                                                                                                                                                                                                                                                                  |
| `COMMAND_ERROR`            | UpstashRedis returned HTTP `400`. Upstash uses this single status for both a malformed request and a Redis command that failed (e.g. `"ERR wrong number of arguments for 'get' command"`) — there is no separate status to tell the two apart, so this connect doesn't invent one either. The vendor's raw message is in `error.getContextValue('reason')`. |
| `METHOD_NOT_ALLOWED`       | UpstashRedis returned HTTP `405` (only `HEAD`/`GET`/`POST`/`PUT` are supported).                                                                                                                                                                                                                                                                            |
| `RESPONSE_ERROR`           | A success response's body failed schema validation.                                                                                                                                                                                                                                                                                                         |
| `SERVICE_UNAVAILABLE`      | UpstashRedis returned a `5xx` status.                                                                                                                                                                                                                                                                                                                       |

### Why `400` maps to one code, not two

Upstash's own documentation describes `400 Bad Request` as covering both
"a syntax error, an invalid/unsupported command is sent" **and** "command
execution fails" — the same status, the same `{"error": "..."}` envelope,
for both a malformed request and a Redis-level command error (verified
directly against the vendor's docs). Since there's no way to reliably
tell them apart from the HTTP layer, `COMMAND_ERROR` covers both, with the
vendor's message attached for whoever needs to distinguish them by
reading it.

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
try {
  await client.get('foo');
} catch (error) {
  if (error instanceof UpstashRedisError && error.code === 'COMMAND_ERROR') {
    console.error(
      'Redis rejected the command:',
      error.getContextValue('reason'),
    );
  }
}
```

Use `getContextValue()` to read diagnostic metadata — see
[errors/Base.ts](../errors/Base.ts). The configured Bearer token is never
included in any thrown error's message or context.

---

[← Back to UpstashRedis](../README.md)

## Backing off after a 429

`getContextValue('retryAfterSeconds')` — seconds to wait before retrying, read from whichever header the vendor sent: `Retry-After` (delta seconds or an HTTP-date), `X-RateLimit-Reset-After`, or `X-RateLimit-Reset` / `RateLimit-Reset` (a Unix epoch in seconds or milliseconds). `undefined` when none was present — the value is only ever what the vendor said, never a guess. Upstash has no dedicated rate-limit code yet, so a 429 lands in `UNKNOWN_ERROR` — the hint is still carried there.
