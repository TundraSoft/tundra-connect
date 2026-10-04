# GCS Errors

GCS throws `GCSError` for invalid configuration, JWT signing/token-exchange
failures, documented vendor responses, malformed payloads, timeouts and
network failures — one `instanceof` covers everything.

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

| Code                             | Transient | Meaning                                                                                                                                                                                                                                                |
| -------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CONFIG_INVALID_AUTH_TYPE`       | no        | `auth.type` was neither `BEARER` nor `CUSTOM`.                                                                                                                                                                                                         |
| `CONFIG_INVALID_SERVICE_ACCOUNT` | no        | `CUSTOM` auth is missing `clientEmail`/`privateKey`.                                                                                                                                                                                                   |
| `JWT_SIGNING_FAILED`             | no        | The service-account JWT could not be signed (bad `privateKey`).                                                                                                                                                                                        |
| `TOKEN_EXCHANGE_FAILED`          | no        | The token endpoint refused the signed JWT or returned a malformed token. A transport failure there is `TIMEOUT`/`NETWORK_ERROR` instead.                                                                                                               |
| `INVALID_BUCKET`                 | no        | `bucket` was missing, empty, or whitespace-only.                                                                                                                                                                                                       |
| `INVALID_KEY`                    | no        | `key` was missing, empty, or whitespace-only.                                                                                                                                                                                                          |
| `INVALID_OBJECT_KEY`             | no        | `bucket`/`key` contained a `.`/`..` path segment.                                                                                                                                                                                                      |
| `CONFIG_INVALID_CHUNK_SIZE`      | no        | `putObjectStream`'s `chunkSize` wasn't a positive multiple of 256 KiB.                                                                                                                                                                                 |
| `INVALID_REQUEST`                | no        | GCS rejected the request as invalid.                                                                                                                                                                                                                   |
| `AUTH_ERROR`                     | no        | The access token is missing, expired, or invalid.                                                                                                                                                                                                      |
| `FORBIDDEN`                      | no        | The authenticated identity lacks permission for the operation.                                                                                                                                                                                         |
| `NOT_FOUND`                      | no        | The requested bucket or object doesn't exist.                                                                                                                                                                                                          |
| `CONFLICT`                       | no        | The request conflicts with the resource's current state.                                                                                                                                                                                               |
| `RATE_LIMIT_EXCEEDED`            | **yes**   | GCS rate limit exceeded for the project.                                                                                                                                                                                                               |
| `BACKEND_ERROR`                  | **yes**   | GCS returned an internal/backend error.                                                                                                                                                                                                                |
| `TIMEOUT`                        | **yes**   | No response headers within the `timeout` (seconds; `timeoutSeconds` in context), including during the service-account token exchange. For `getObjectStream()` this bounds the wait for headers; an `idleTimeout` stall later errors the stream itself. |
| `NETWORK_ERROR`                  | **yes**   | `fetch` failed before any response (DNS, TLS, connection reset), including during the service-account token exchange. The original is the `cause`.                                                                                                     |
| `RESPONSE_ERROR`                 | no        | A successful response's body failed schema validation — or, for `putObjectStream`, the session had no `Location`, an intermediate chunk wasn't answered `308`, or fewer bytes were persisted than sent.                                                |
| `SERVICE_UNAVAILABLE`            | no        | An undocumented status/response could not be mapped.                                                                                                                                                                                                   |
| `UNKNOWN_ERROR`                  | no        | An unknown constructor code was supplied.                                                                                                                                                                                                              |

`error.transient` is `true` for exactly the codes marked **yes** above —
`TIMEOUT`, `NETWORK_ERROR`, `RATE_LIMIT_EXCEEDED` and `BACKEND_ERROR` — and
`false` for a definite refusal or a misconfiguration. Branch on it to tell
"no answer yet, retry later" from "GCS said no". The set is also exported as
`GCS_TRANSIENT_CODES` from `@tundraconnect/gcs/errors`.

```ts
if (error instanceof GCSError && error.transient) {
  // keep the job queued and try again later
}
```

`SERVICE_UNAVAILABLE` is **not** transient: every 5xx already maps to
`BACKEND_ERROR`, so it only covers a status nothing else maps — in practice
a 4xx such as a 412 precondition failure.

### Token exchange (service-account auth)

A service-account token exchange that gets no answer surfaces as the
transient `TIMEOUT` or `NETWORK_ERROR`. Earlier releases reported both as
`TOKEN_EXCHANGE_FAILED`, with `reason: 'timeout'` or `'request failed'`.
`TOKEN_EXCHANGE_FAILED` now means the token endpoint answered and refused
(a non-2xx status, with `status`/`body` in context) or returned a malformed
token (`responseError` in context). It is not transient.

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof GCSError && error.code === 'NOT_FOUND') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, `reason`, `cleanupError` (a failed compensating delete/cancel
after a `putObject`/`putObjectStream` failure), `timeoutSeconds` (on
`TIMEOUT`: the deadline that was missed), or `originalCode`.

## Backing off after a 429

A rate-limited request throws `RATE_LIMIT_EXCEEDED`. Two context values tell you what to
do next:

| Context             | Meaning                                                                                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retryAfterSeconds` | Seconds the vendor asked you to wait, parsed by RESTler from `Retry-After` (delta seconds or an HTTP-date), `X-RateLimit-Reset-After`, `RateLimit-Reset`, or an epoch-seconds `X-RateLimit-Reset`. `undefined` when the response carried none — never a guess. |
| `retried`           | Set only when `maxRetryWait` is configured: `true` if RESTler already waited once and was throttled again, `false` if it did not wait (the hint exceeded the cap, or there was no hint to wait on).                                                            |

Nothing is retried by default. Opt in with two client options (seconds,
each `0`–`120`):

- **`maxRetryWait`** — when a 429 carries a hint no longer than this,
  RESTler waits that long and retries **once**; otherwise it throws
  `RATE_LIMIT_EXCEEDED` immediately. `0` disables the retry.
- **`defaultRetryWait`** — the wait used when a 429 carries **no** hint.
  Without it a hintless 429 is never retried: RESTler does not invent a
  delay. Only consulted when `maxRetryWait` is set, and still capped by it.

Streamed downloads (`getObjectStream()`) follow the same rules as every
other method (`@tundralibs/restler` >= 1.3.1).

---

[← Back to GCS](../README.md)
