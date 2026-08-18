# AzureBlob Errors

AzureBlob throws `AzureBlobError` for invalid configuration, invalid request
input, documented vendor error codes, and malformed payloads.

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

| Code                            | Meaning                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_INVALID_ACCOUNT`        | `auth` is absent, or `auth.account` is missing/empty.                                                                                 |
| `CONFIG_MISSING_CREDENTIALS`    | Neither `accountKey` nor `sasToken` was supplied.                                                                                     |
| `CONFIG_INVALID_API_VERSION`    | `apiVersion` is not a non-empty string.                                                                                               |
| `INVALID_BUCKET`                | `bucket` is missing/empty.                                                                                                            |
| `INVALID_KEY`                   | `key` is missing/empty.                                                                                                               |
| `INVALID_PATH_SEGMENT`          | `bucket`/`key` contains a `.`/`..` path segment — rejected up front to prevent a path-traversal/signature-divergence bug (see below). |
| `BLOB_NOT_FOUND`                | Vendor `BlobNotFound` (404).                                                                                                          |
| `CONTAINER_NOT_FOUND`           | Vendor `ContainerNotFound` (404).                                                                                                     |
| `BLOB_ALREADY_EXISTS`           | Vendor `BlobAlreadyExists` (409).                                                                                                     |
| `CONTAINER_ALREADY_EXISTS`      | Vendor `ContainerAlreadyExists` (409).                                                                                                |
| `INVALID_BLOB_TYPE`             | Vendor `InvalidBlobType` (409).                                                                                                       |
| `AUTHENTICATION_FAILED`         | Vendor `AuthenticationFailed` (403).                                                                                                  |
| `INVALID_AUTHENTICATION_INFO`   | Vendor `InvalidAuthenticationInfo` (401 or 400).                                                                                      |
| `NO_AUTHENTICATION_INFORMATION` | Vendor `NoAuthenticationInformation` (401).                                                                                           |
| `ACCOUNT_IS_DISABLED`           | Vendor `AccountIsDisabled` (403).                                                                                                     |
| `MISSING_REQUIRED_HEADER`       | Vendor `MissingRequiredHeader` (400).                                                                                                 |
| `INVALID_HEADER_VALUE`          | Vendor `InvalidHeaderValue` (400).                                                                                                    |
| `REQUEST_BODY_TOO_LARGE`        | Vendor `RequestBodyTooLarge` (413).                                                                                                   |
| `SERVER_BUSY`                   | Vendor `ServerBusy` (503).                                                                                                            |
| `INTERNAL_ERROR`                | Vendor `InternalError` (500).                                                                                                         |
| `RESPONSE_ERROR`                | An unrecognised vendor code, or a response that failed local schema validation.                                                       |
| `UNKNOWN_ERROR`                 | An unknown constructor code was supplied.                                                                                             |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof AzureBlobError && error.code === 'BLOB_NOT_FOUND') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, `vendorCode`, `vendorMessage`, `bucket`, or `key`. `bucket`/`key`
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

---

[← Back to AzureBlob](../README.md)
