# S3 Errors

S3 throws `S3Error` for invalid configuration, documented vendor
responses, and malformed payloads.

```ts
import { S3Error, S3ErrorCodes } from '@tundraconnect/s3/errors';

const error = new S3Error('NO_SUCH_KEY', { key: 'missing.txt' });
console.log(error.message);
console.log(S3ErrorCodes.NO_SUCH_KEY);
```

## Codes

| Code                              | Meaning                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_INVALID_AUTH`             | `auth` is missing, not `CUSTOM`, or its access key id/secret/region is blank.                                             |
| `CONFIG_INVALID_BUCKET`           | A method was called with an empty/missing bucket name.                                                                    |
| `CONFIG_INVALID_KEY`              | A method was called with an empty/missing object key.                                                                     |
| `CONFIG_INVALID_BODY`             | `putObject`'s `body` wasn't a `Blob`, `Uint8Array`, `ArrayBuffer`, or `string`.                                           |
| `CONFIG_INVALID_FORCE_PATH_STYLE` | `forcePathStyle` was set to a non-boolean value.                                                                          |
| `INVALID_OBJECT_KEY`              | `bucket`/`key` contains a `.`/`..` path segment — rejected up front to prevent a path-traversal/signature-divergence bug. |
| `RESPONSE_ERROR`                  | A successful response's body/headers didn't match the expected shape.                                                     |
| `NO_SUCH_KEY`                     | Vendor `NoSuchKey` (404) — the object does not exist.                                                                     |
| `NO_SUCH_BUCKET`                  | Vendor `NoSuchBucket` (404) — the bucket does not exist.                                                                  |
| `ACCESS_DENIED`                   | Vendor `AccessDenied` (403).                                                                                              |
| `INVALID_ACCESS_KEY_ID`           | Vendor `InvalidAccessKeyId` (403) — the access key id is unrecognized.                                                    |
| `SIGNATURE_DOES_NOT_MATCH`        | Vendor `SignatureDoesNotMatch` (403) — indicates a SigV4 signing bug.                                                     |
| `REQUEST_TIME_TOO_SKEWED`         | Vendor `RequestTimeTooSkewed` (403) — local clock too far from S3's.                                                      |
| `PRECONDITION_FAILED`             | Vendor `PreconditionFailed` (412) — e.g. an `If-Match` condition.                                                         |
| `INVALID_RANGE`                   | Vendor `InvalidRange` (416).                                                                                              |
| `ENTITY_TOO_LARGE`                | Vendor `EntityTooLarge` (400).                                                                                            |
| `METHOD_NOT_ALLOWED`              | Vendor `MethodNotAllowed` (405).                                                                                          |
| `INTERNAL_ERROR`                  | Vendor `InternalError` (500).                                                                                             |
| `SLOW_DOWN`                       | Vendor `SlowDown` (503) — back off and retry.                                                                             |
| `SERVICE_UNAVAILABLE`             | Vendor `ServiceUnavailable` (503), or the fallback when no error body/status is recognized.                               |
| `UNKNOWN_ERROR`                   | An undocumented vendor `<Error><Code>` or an unrecognized constructor code — the original is preserved as `originalCode`. |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof S3Error && error.code === 'NO_SUCH_KEY') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, `message` (the vendor's own description), `resource`,
`requestId`, `bucket`, `key`, or `originalCode`. `bucket`/`key` are
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

---

[← Back to S3](../README.md)

## Backing off after a 429

`getContextValue('retryAfterSeconds')` — seconds to wait before retrying, parsed by RESTler (`_parseRetryAfter`) from `Retry-After` (delta seconds or an HTTP-date), `X-RateLimit-Reset-After`, `RateLimit-Reset`, or an epoch-seconds `X-RateLimit-Reset`; `undefined` when none was present — never a guess. Pass `maxRetryWait` (seconds) at construction to have RESTler wait the hinted time and retry **once**; if that attempt is throttled too, or the hint exceeds the cap, the error is raised with `retried` set so you know whether a wait already happened. Present on `RATE_LIMITED` when the vendor sent a usable hint.
