# S3 Errors

S3 throws `S3Error` for invalid configuration, documented vendor
responses, malformed payloads, timeouts and network failures — one
`instanceof` covers everything.

```ts
import { S3Error, S3ErrorCodes } from '@tundraconnect/s3/errors';

const error = new S3Error('NO_SUCH_KEY', { key: 'missing.txt' });
console.log(error.message);
console.log(S3ErrorCodes.NO_SUCH_KEY);
```

## Codes

| Code                              | Transient | Meaning                                                                                                                                                                                           |
| --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_INVALID_AUTH`             | no        | `auth` is missing, not `CUSTOM`, or its access key id/secret/region is blank.                                                                                                                     |
| `CONFIG_INVALID_BUCKET`           | no        | A method was called with an empty/missing bucket name.                                                                                                                                            |
| `CONFIG_INVALID_KEY`              | no        | A method was called with an empty/missing object key.                                                                                                                                             |
| `CONFIG_INVALID_BODY`             | no        | `putObject`'s `body` wasn't a `Blob`, `Uint8Array`, `ArrayBuffer`, or `string`.                                                                                                                   |
| `CONFIG_INVALID_FORCE_PATH_STYLE` | no        | `forcePathStyle` was set to a non-boolean value.                                                                                                                                                  |
| `CONFIG_INVALID_PART_SIZE`        | no        | `putObjectStream`'s `partSize` was not an integer of at least 5 MiB (`MIN_PART_SIZE`).                                                                                                            |
| `INVALID_OBJECT_KEY`              | no        | `bucket`/`key` contains a `.`/`..` path segment — rejected up front to prevent a path-traversal/signature-divergence bug.                                                                         |
| `RESPONSE_ERROR`                  | no        | A successful response's body/headers didn't match the expected shape.                                                                                                                             |
| `NO_SUCH_KEY`                     | no        | Vendor `NoSuchKey` (404) — the object does not exist.                                                                                                                                             |
| `NO_SUCH_BUCKET`                  | no        | Vendor `NoSuchBucket` (404) — the bucket does not exist.                                                                                                                                          |
| `ACCESS_DENIED`                   | no        | Vendor `AccessDenied` (403).                                                                                                                                                                      |
| `INVALID_ACCESS_KEY_ID`           | no        | Vendor `InvalidAccessKeyId` (403) — the access key id is unrecognized.                                                                                                                            |
| `SIGNATURE_DOES_NOT_MATCH`        | no        | Vendor `SignatureDoesNotMatch` (403) — indicates a SigV4 signing bug.                                                                                                                             |
| `REQUEST_TIME_TOO_SKEWED`         | no        | Vendor `RequestTimeTooSkewed` (403) — local clock too far from S3's.                                                                                                                              |
| `PRECONDITION_FAILED`             | no        | Vendor `PreconditionFailed` (412) — e.g. an `If-Match` condition.                                                                                                                                 |
| `INVALID_RANGE`                   | no        | Vendor `InvalidRange` (416).                                                                                                                                                                      |
| `ENTITY_TOO_LARGE`                | no        | Vendor `EntityTooLarge` (400); also raised locally when a `putObjectStream` body would need more than 10,000 parts.                                                                               |
| `ENTITY_TOO_SMALL`                | no        | Vendor `EntityTooSmall` (400) — a non-final multipart part was under 5 MiB.                                                                                                                       |
| `NO_SUCH_UPLOAD`                  | no        | Vendor `NoSuchUpload` (404) — the multipart upload was aborted, completed, or never existed.                                                                                                      |
| `INVALID_PART`                    | no        | Vendor `InvalidPart` (400) — a part listed at CompleteMultipartUpload was missing or its ETag didn't match.                                                                                       |
| `INVALID_PART_ORDER`              | no        | Vendor `InvalidPartOrder` (400) — the completion manifest wasn't in ascending part order.                                                                                                         |
| `METHOD_NOT_ALLOWED`              | no        | Vendor `MethodNotAllowed` (405).                                                                                                                                                                  |
| `INTERNAL_ERROR`                  | **yes**   | Vendor `InternalError` (500).                                                                                                                                                                     |
| `SLOW_DOWN`                       | **yes**   | Vendor `SlowDown` (503), or a bare 429 from an S3-compatible store (R2, MinIO, Spaces) — back off and retry.                                                                                      |
| `SERVICE_UNAVAILABLE`             | **yes**   | Vendor `ServiceUnavailable` (503), or the fallback when no error body/status is recognized.                                                                                                       |
| `TIMEOUT`                         | **yes**   | No response headers within the `timeout` (seconds; `timeoutSeconds` in context). For `getObjectStream()` this bounds the wait for headers; an `idleTimeout` stall later errors the stream itself. |
| `NETWORK_ERROR`                   | **yes**   | `fetch` failed before any response (DNS, TLS, connection reset). The original is the `cause`.                                                                                                     |
| `UNKNOWN_ERROR`                   | no        | An undocumented vendor `<Error><Code>` or an unrecognized constructor code — the original is preserved as `originalCode`.                                                                         |

`error.transient` is `true` for exactly the codes marked **yes** above —
`TIMEOUT`, `NETWORK_ERROR`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE` and
`SLOW_DOWN` (AWS documents `InternalError` and `ServiceUnavailable` as
retryable) — and `false` for a definite refusal or a misconfiguration. Branch
on it to tell "no answer yet, retry later" from "S3 said no". The set is
also exported as `S3_TRANSIENT_CODES` from `@tundraconnect/s3/errors`.

```ts
if (error instanceof S3Error && error.transient) {
  // keep the job queued and try again later
}
```

Note that `SERVICE_UNAVAILABLE` is also the fallback for an error status
with no recognizable `<Error>` body and no status mapping (for example a
bodiless `HEAD` 400), so it is transient even in that rare case.

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof S3Error && error.code === 'NO_SUCH_KEY') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, `message` (the vendor's own description), `resource`,
`requestId`, `bucket`, `key`, `cleanupError` (a failed
AbortMultipartUpload after a `putObjectStream` failure), `timeoutSeconds`
(on `TIMEOUT`: the deadline that was missed), or `originalCode`. `bucket`/`key` are
populated from the calling method's own arguments whenever they're known —
including on `NO_SUCH_KEY`/`NO_SUCH_BUCKET`, whose message templates
interpolate them.

## `headObject` is special

S3 sends **no body** on a `HEAD` error response — only the status code is
available. `headObject` therefore maps errors purely by HTTP status
(`404` → `NO_SUCH_KEY`, `403` → `ACCESS_DENIED`, ...), so a 404 caused by a
missing _bucket_ is still reported as `NO_SUCH_KEY`. Every other method
(`putObject`, `getObject`, `deleteObject`, `listObjects`) gets S3's
documented `<Error>` XML body and maps from the actual vendor `Code`.

## Backing off after a 429

A rate-limited request throws `SLOW_DOWN`. Two context values tell you what to
do next:

| Context             | Meaning                                                                                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retryAfterSeconds` | Seconds the vendor asked you to wait, parsed by RESTler from `Retry-After` (delta seconds or an HTTP-date), `X-RateLimit-Reset-After`, `RateLimit-Reset`, or an epoch-seconds `X-RateLimit-Reset`. `undefined` when the response carried none — never a guess. |
| `retried`           | Set only when `maxRetryWait` is configured: `true` if RESTler already waited once and was throttled again, `false` if it did not wait (the hint exceeded the cap, or there was no hint to wait on).                                                            |

Nothing is retried by default. Opt in with two client options (seconds,
each `0`–`120`):

- **`maxRetryWait`** — when a 429 carries a hint no longer than this,
  RESTler waits that long and retries **once**; otherwise it throws
  `SLOW_DOWN` immediately. `0` disables the retry.
- **`defaultRetryWait`** — the wait used when a 429 carries **no** hint.
  Without it a hintless 429 is never retried: RESTler does not invent a
  delay. Only consulted when `maxRetryWait` is set, and still capped by it.

Streamed downloads (`getObjectStream()`) follow the same rules as every
other method (`@tundralibs/restler` >= 1.3.1).

---

[← Back to S3](../README.md)
