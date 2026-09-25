# ntfy Errors

ntfy throws `NtfyError` for local request validation and vendor responses.
`publish()` never rejects with a raw `GuardianError` directly — a failed
local validation is wrapped as `NtfyError` (`REQUEST_VALIDATION_ERROR`)
with the underlying `GuardianError` attached as `cause` — see
[Schemas](ntfy-Schemas.md).

```ts
import { NtfyError, NtfyErrorCodes } from '@tundraconnect/ntfy/errors';

const error = new NtfyError('AUTH_REQUIRED', { status: 401 });
console.log(error.message);
console.log(NtfyErrorCodes.AUTH_REQUIRED);
```

## Codes

ntfy's HTTP error envelope (`{ code, http, error, link? }`, see
`ErrorSchemaObject`) carries a stable numeric vendor `code` (e.g. `40101`),
but these connect codes are keyed off the HTTP status the vendor actually
returned — the numeric vendor code and any `link` are preserved as
diagnostic metadata instead.

| Code                       | Meaning                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_ERROR` | The request failed local schema validation and was never sent.                   |
| `BAD_REQUEST`              | ntfy returned `400 Bad Request` (e.g. invalid topic name, malformed JSON).       |
| `AUTH_REQUIRED`            | ntfy returned `401 Unauthorized` — the topic requires credentials.               |
| `FORBIDDEN`                | ntfy returned `403 Forbidden` — the configured credentials can't publish here.   |
| `NOT_FOUND`                | ntfy returned `404 Not Found`.                                                   |
| `PAYLOAD_TOO_LARGE`        | ntfy returned `413` — the message/attachment exceeded a size or bandwidth limit. |
| `RATE_LIMITED`             | ntfy returned `429` — a request, daily-message, or auth-failure limit was hit.   |
| `RESPONSE_ERROR`           | A success response's body failed schema validation.                              |
| `SERVICE_UNAVAILABLE`      | A `5xx` response, or any error response whose body didn't parse.                 |
| `UNKNOWN_ERROR`            | An unmapped status was returned, or an unknown code was supplied.                |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof NtfyError && error.code === 'AUTH_REQUIRED') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, ntfy's numeric `vendorCode`, and `link` (a docs link, when
present):

```ts
try {
  await client.publish({ topic: 'mytopic', message: 'hi' });
} catch (error) {
  if (error instanceof NtfyError) {
    console.log(error.getContextValue('status'));
    console.log(error.getContextValue('vendorCode'));
  }
}
```

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

[← Back to ntfy](../README.md)
