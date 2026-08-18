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

---

[← Back to ntfy](../README.md)
