# Sentry Errors

`Sentry` throws `SentryError` for invalid configuration, local request
validation, and vendor responses — see [errors/Base.ts](../errors/Base.ts)
and [errors/SentryErrorCodes.ts](../errors/SentryErrorCodes.ts).
`updateIssue()`/`createRelease()` may also reject with a raw `GuardianError`
(as `error.cause`) when the request itself fails local schema validation
before any network call is made — see [Schemas](Sentry-Schemas.md).

```ts
import { SentryError, SentryErrorCodes } from '@tundraconnect/sentry/errors';

const error = new SentryError('NOT_FOUND', { status: 404 });
console.log(error.message);
console.log(SentryErrorCodes.NOT_FOUND);
```

## Codes

Sentry's documented error envelope (`{ detail, causes? }`, see
[Schemas](Sentry-Schemas.md)) carries no machine-readable error code — only
free-text `detail`. These codes are therefore connect-specific, keyed off
the HTTP status Sentry actually returned
(https://docs.sentry.io/api/), plus configuration and local
request-validation failures that never come from the wire.

| Code                          | Meaning                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `CONFIG_INVALID_TOKEN`        | `auth` is missing, isn't `type: 'BEARER'`, or its `token` is blank/not a string.                   |
| `CONFIG_INVALID_ORGANIZATION` | `organization` is missing, blank, or not a string.                                                 |
| `INVALID_REQUEST`             | Local request validation failed (before a request was sent), or Sentry returned `400 Bad Request`. |
| `AUTH_FAILED`                 | Sentry returned `401 Unauthorized`.                                                                |
| `FORBIDDEN`                   | Sentry returned `403 Forbidden` (token scope/permissions).                                         |
| `NOT_FOUND`                   | Sentry returned `404 Not Found`.                                                                   |
| `RATE_LIMITED`                | Sentry returned `429 Too Many Requests`.                                                           |
| `RESPONSE_ERROR`              | A success response's body failed schema validation.                                                |
| `SERVICE_UNAVAILABLE`         | A `5xx` response, or any response whose body didn't parse.                                         |
| `UNKNOWN_ERROR`               | An unmapped status was returned, or an unknown code was supplied.                                  |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof SentryError && error.code === 'RATE_LIMITED') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata — never the token: this
connect never places `auth.token` into an error's context or message, so
`error.message`/`error.toJSON()` are always safe to log.

```ts
try {
  await client.listIssues();
} catch (error) {
  if (error instanceof SentryError) {
    console.log(error.getContextValue('status'));
    console.log(error.getContextValue('detail'));
  }
}
```

### Rate limits

A `429` reads Sentry's documented rate-limit response headers
(https://docs.sentry.io/api/ratelimits/) into the thrown error's context —
`rateLimitLimit`, `rateLimitRemaining`, `rateLimitReset` (UTC seconds since
epoch when the window resets), `rateLimitConcurrentLimit`, and
`rateLimitConcurrentRemaining`. Sentry documents no `Retry-After` header for
this endpoint family.

```ts
try {
  await client.listIssues();
} catch (error) {
  if (error instanceof SentryError && error.code === 'RATE_LIMITED') {
    const resetAt = error.getContextValue('rateLimitReset');
    console.log(`Retry after ${resetAt}`);
  }
}
```

---

[← Back to Sentry](../README.md)

## Backing off after a 429

`getContextValue('retryAfterSeconds')` — seconds to wait before retrying, read from whichever header the vendor sent: `Retry-After` (delta seconds or an HTTP-date), `X-RateLimit-Reset-After`, or `X-RateLimit-Reset` / `RateLimit-Reset` (a Unix epoch in seconds or milliseconds). `undefined` when none was present — the value is only ever what the vendor said, never a guess. Present on `RATE_LIMITED` when the vendor sent a usable hint.
