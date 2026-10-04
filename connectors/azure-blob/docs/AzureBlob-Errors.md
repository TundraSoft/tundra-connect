# AzureBlob Errors

AzureBlob throws `AzureBlobError` for invalid configuration, invalid request
input, documented vendor error codes, malformed payloads, timeouts and
network failures — one `instanceof` covers everything.

```ts
import {
  AzureBlobError,
  AzureBlobErrorCodes,
} from '@tundraconnect/azure-blob/errors';

const error = new AzureBlobError('BLOB_NOT_FOUND', {
  bucket: 'my-container',
  key: 'missing.txt',
});
console.log(error.message);
console.log(AzureBlobErrorCodes.BLOB_NOT_FOUND);
```

Vendor errors are matched first off the cheaper `x-ms-error-code` response
header (present on API versions `2017-07-29` and later), falling back to
parsing the XML `<Error><Code>...</Code></Error>` body. The vendor's `Code`
string is preserved as `vendorCode` on the error's context even when it maps
to one of the codes below.

## Codes

| Code                            | Transient | Meaning                                                                                                                                                                                           |
| ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_INVALID_ACCOUNT`        | no        | `auth` is absent, or `auth.account` is missing/empty.                                                                                                                                             |
| `CONFIG_MISSING_CREDENTIALS`    | no        | Neither `accountKey` nor `sasToken` was supplied.                                                                                                                                                 |
| `CONFIG_INVALID_API_VERSION`    | no        | `apiVersion` is not a non-empty string.                                                                                                                                                           |
| `INVALID_BUCKET`                | no        | `bucket` is missing/empty.                                                                                                                                                                        |
| `INVALID_KEY`                   | no        | `key` is missing/empty.                                                                                                                                                                           |
| `INVALID_PATH_SEGMENT`          | no        | `bucket`/`key` contains a `.`/`..` path segment — rejected up front to prevent a path-traversal/signature-divergence bug (see below).                                                             |
| `BLOB_NOT_FOUND`                | no        | Vendor `BlobNotFound` (404).                                                                                                                                                                      |
| `CONTAINER_NOT_FOUND`           | no        | Vendor `ContainerNotFound` (404).                                                                                                                                                                 |
| `BLOB_ALREADY_EXISTS`           | no        | Vendor `BlobAlreadyExists` (409).                                                                                                                                                                 |
| `CONTAINER_ALREADY_EXISTS`      | no        | Vendor `ContainerAlreadyExists` (409).                                                                                                                                                            |
| `INVALID_BLOB_TYPE`             | no        | Vendor `InvalidBlobType` (409).                                                                                                                                                                   |
| `AUTHENTICATION_FAILED`         | no        | Vendor `AuthenticationFailed` (403).                                                                                                                                                              |
| `INVALID_AUTHENTICATION_INFO`   | no        | Vendor `InvalidAuthenticationInfo` (401 or 400).                                                                                                                                                  |
| `NO_AUTHENTICATION_INFORMATION` | no        | Vendor `NoAuthenticationInformation` (401).                                                                                                                                                       |
| `ACCOUNT_IS_DISABLED`           | no        | Vendor `AccountIsDisabled` (403).                                                                                                                                                                 |
| `MISSING_REQUIRED_HEADER`       | no        | Vendor `MissingRequiredHeader` (400).                                                                                                                                                             |
| `INVALID_HEADER_VALUE`          | no        | Vendor `InvalidHeaderValue` (400).                                                                                                                                                                |
| `REQUEST_BODY_TOO_LARGE`        | no        | Vendor `RequestBodyTooLarge` (413).                                                                                                                                                               |
| `SERVER_BUSY`                   | **yes**   | Vendor `ServerBusy` (503), or a 429/503 that carries no `x-ms-error-code` at all.                                                                                                                 |
| `INTERNAL_ERROR`                | **yes**   | Vendor `InternalError` (500).                                                                                                                                                                     |
| `TIMEOUT`                       | **yes**   | No response headers within the `timeout` (seconds; `timeoutSeconds` in context). For `getObjectStream()` this bounds the wait for headers; an `idleTimeout` stall later errors the stream itself. |
| `NETWORK_ERROR`                 | **yes**   | `fetch` failed before any response (DNS, TLS, connection reset). The original is the `cause`.                                                                                                     |
| `RESPONSE_ERROR`                | no        | An unrecognised vendor code, or a response that failed local schema validation.                                                                                                                   |
| `UNKNOWN_ERROR`                 | no        | An unknown constructor code was supplied.                                                                                                                                                         |

`error.transient` is `true` for exactly the codes marked **yes** above —
`TIMEOUT`, `NETWORK_ERROR`, `SERVER_BUSY` and `INTERNAL_ERROR` (Azure
documents `ServerBusy` and `InternalError` as retryable) — and `false` for a
definite refusal or a misconfiguration. Branch on it to tell "no answer yet,
retry later" from "Azure said no". The set is also exported as
`AZURE_BLOB_TRANSIENT_CODES` from `@tundraconnect/azure-blob/errors`.

```ts
if (error instanceof AzureBlobError && error.transient) {
  // keep the job queued and try again later
}
```

A 5xx other than 503 that carries no recognised vendor code (for example a
bare 502 from a proxy in front of the account) still surfaces as
`RESPONSE_ERROR`, which is not transient.

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof AzureBlobError && error.code === 'BLOB_NOT_FOUND') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, `vendorCode`, `vendorMessage`, `bucket`, `key`, or
`timeoutSeconds` (on `TIMEOUT`: the deadline that was missed). `bucket`/`key`
are populated from the calling method's own arguments whenever they're
known — including on `BLOB_NOT_FOUND`/`CONTAINER_NOT_FOUND`, whose message
templates interpolate them.

## `bucket`/`key` path-traversal validation

Every public method rejects a `bucket`/`key` whose value — or any of its
`/`-delimited segments — is exactly `.` or `..`, _before_ building a
request. Left unvalidated, such a value builds a request path (and, for
Shared Key auth, a signed `CanonicalizedResource`) that RESTler's own
path-joining logic later collapses differently at send time, diverging the
signed resource from the one actually requested. This matters even more
under SAS-token auth, where requests aren't signed client-side at all, so
there's no signature to catch the divergence.

## Backing off after a 429

A rate-limited request throws `SERVER_BUSY`. Two context values tell you what to
do next:

| Context             | Meaning                                                                                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retryAfterSeconds` | Seconds the vendor asked you to wait, parsed by RESTler from `Retry-After` (delta seconds or an HTTP-date), `X-RateLimit-Reset-After`, `RateLimit-Reset`, or an epoch-seconds `X-RateLimit-Reset`. `undefined` when the response carried none — never a guess. |
| `retried`           | Set only when `maxRetryWait` is configured: `true` if RESTler already waited once and was throttled again, `false` if it did not wait (the hint exceeded the cap, or there was no hint to wait on).                                                            |

Nothing is retried by default. Opt in with two client options (seconds,
each `0`–`120`):

- **`maxRetryWait`** — when a 429 carries a hint no longer than this,
  RESTler waits that long and retries **once**; otherwise it throws
  `SERVER_BUSY` immediately. `0` disables the retry.
- **`defaultRetryWait`** — the wait used when a 429 carries **no** hint.
  Without it a hintless 429 is never retried: RESTler does not invent a
  delay. Only consulted when `maxRetryWait` is set, and still capped by it.

Streamed downloads (`getObjectStream()`) follow the same rules as every
other method (`@tundralibs/restler` >= 1.3.1).

---

[← Back to AzureBlob](../README.md)
