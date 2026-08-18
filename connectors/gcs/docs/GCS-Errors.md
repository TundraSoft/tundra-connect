# GCS Errors

GCS throws `GCSError` for invalid configuration, JWT signing/token-exchange
failures, documented vendor responses, and malformed payloads.

```ts
import { GCSError, GCSErrorCodes } from '@tundraconnect/gcs/errors';

try {
  await client.getObject({ bucket: 'my-bucket', key: 'missing.txt' });
} catch (error) {
  if (error instanceof GCSError) {
    console.log(error.message);
    console.log(error.getContextValue('status'));
  }
}
```

## Vendor error mapping

GCS's JSON API returns a documented envelope on failure:

```json
{
  "error": {
    "code": 404,
    "message": "Not Found",
    "errors": [
      { "domain": "global", "reason": "notFound", "message": "Not Found" }
    ]
  }
}
```

The connect keys its mapping off `error.errors[0].reason`
(see the
[vendor status-codes reference](https://cloud.google.com/storage/docs/json_api/v1/status-codes)),
falling back to the HTTP status code when `errors` is absent or the body
isn't the documented JSON envelope (for example, an error surfaced by
`getObject`'s binary `alt=media` request, whose body is a `Blob`).

| Vendor `reason`                           | Status | GCS error code        |
| ----------------------------------------- | ------ | --------------------- |
| `required`, `invalid`, `invalidParameter` | 400    | `INVALID_REQUEST`     |
| `authError`                               | 401    | `AUTH_ERROR`          |
| `forbidden`, `insufficientPermissions`    | 403    | `FORBIDDEN`           |
| `notFound`                                | 404    | `NOT_FOUND`           |
| `conflict`                                | 409    | `CONFLICT`            |
| `usageLimits.rateLimitExceeded`           | 429    | `RATE_LIMIT_EXCEEDED` |
| `backendError`, `internalError`           | 500    | `BACKEND_ERROR`       |

## Codes

| Code                             | Meaning                                                         |
| -------------------------------- | --------------------------------------------------------------- |
| `CONFIG_INVALID_AUTH_TYPE`       | `auth.type` was neither `BEARER` nor `CUSTOM`.                  |
| `CONFIG_INVALID_SERVICE_ACCOUNT` | `CUSTOM` auth is missing `clientEmail`/`privateKey`.            |
| `JWT_SIGNING_FAILED`             | The service-account JWT could not be signed (bad `privateKey`). |
| `TOKEN_EXCHANGE_FAILED`          | The signed JWT could not be exchanged for an access token.      |
| `INVALID_BUCKET`                 | `bucket` was missing, empty, or whitespace-only.                |
| `INVALID_KEY`                    | `key` was missing, empty, or whitespace-only.                   |
| `INVALID_OBJECT_KEY`             | `bucket`/`key` contained a `.`/`..` path segment.               |
| `INVALID_REQUEST`                | GCS rejected the request as invalid.                            |
| `AUTH_ERROR`                     | The access token is missing, expired, or invalid.               |
| `FORBIDDEN`                      | The authenticated identity lacks permission for the operation.  |
| `NOT_FOUND`                      | The requested bucket or object doesn't exist.                   |
| `CONFLICT`                       | The request conflicts with the resource's current state.        |
| `RATE_LIMIT_EXCEEDED`            | GCS rate limit exceeded for the project.                        |
| `BACKEND_ERROR`                  | GCS returned an internal/backend error.                         |
| `RESPONSE_ERROR`                 | A successful response's body failed schema validation.          |
| `SERVICE_UNAVAILABLE`            | An undocumented status/response could not be mapped.            |
| `UNKNOWN_ERROR`                  | An unknown constructor code was supplied.                       |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof GCSError && error.code === 'NOT_FOUND') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, `reason`, or `originalCode`.

---

[← Back to GCS](../README.md)
