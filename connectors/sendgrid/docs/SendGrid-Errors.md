# SendGrid Errors

SendGrid throws `SendGridError` for invalid configuration, local request
validation, and vendor responses. `sendMail()` may also reject with a raw
`GuardianError` when the request itself fails schema validation before any
network call is made — see [Schemas](SendGrid-Schemas.md).

```ts
import {
  SendGridError,
  SendGridErrorCodes,
} from '@tundraconnect/sendgrid/errors';

const error = new SendGridError('AUTH_REQUIRED', { status: 401 });
console.log(error.message);
console.log(SendGridErrorCodes.AUTH_REQUIRED);
```

## Codes

SendGrid does not publish discrete machine-readable error codes — every
4xx/5xx response body is a list of free-text `{ message, field, help? }`
entries (see `ErrorSchemaObject`). These codes are therefore
connect-specific, keyed off the HTTP status the vendor actually returned.

| Code                     | Meaning                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `CONFIG_INVALID_API_KEY` | `auth` is missing, isn't `type: 'BEARER'`, or its `token` is blank or not a string. |
| `AUTH_REQUIRED`          | SendGrid returned `401 Unauthorized`.                                               |
| `VALIDATION_ERROR`       | SendGrid returned `400 Bad Request`.                                                |
| `FORBIDDEN`              | SendGrid returned `403 Forbidden` (plan or key permissions).                        |
| `NOT_FOUND`              | SendGrid returned `404 Not Found`.                                                  |
| `METHOD_NOT_ALLOWED`     | SendGrid returned `405 Method Not Allowed`.                                         |
| `PAYLOAD_TOO_LARGE`      | SendGrid returned `413 Payload Too Large`.                                          |
| `RATE_LIMITED`           | SendGrid returned `429 Too Many Requests`.                                          |
| `RESPONSE_ERROR`         | A `200`/`202` response body failed schema validation.                               |
| `SERVICE_UNAVAILABLE`    | A `5xx` response, or any response whose body didn't parse.                          |
| `UNKNOWN_ERROR`          | An unmapped status was returned, or an unknown code was supplied.                   |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof SendGridError && error.code === 'NOT_FOUND') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, the raw vendor `errors` array, and `id` (SendGrid's request id,
when present):

```ts
try {
  await client.sendMail(request);
} catch (error) {
  if (error instanceof SendGridError) {
    console.log(error.getContextValue('status'));
    console.log(error.getContextValue('errors'));
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

[← Back to SendGrid](../README.md)

## Webhook codes

| Code                        | Raised when                                             |
| --------------------------- | ------------------------------------------------------- |
| `WEBHOOK_INVALID_HEADERS`   | A required signature header is missing.                 |
| `WEBHOOK_TIMESTAMP_INVALID` | Unparseable timestamp, or outside the tolerance window. |
| `WEBHOOK_INVALID_KEY`       | The verification key is not a valid P-256 public key.   |
| `WEBHOOK_SIGNATURE_INVALID` | **Treat the request as forged.**                        |
