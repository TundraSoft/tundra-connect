# CloudflareKV Errors

Every failure from `@tundraconnect/cloudflare-kv` is a `CloudflareKVError`,
response-validation failures included, so one `instanceof` covers
everything. Branch on the readonly `code`, never on a message substring.
A 429 is a `CloudflareKVRateLimitError`, a subclass.

```ts
import {
  CloudflareKVError,
  CloudflareKVRateLimitError,
} from '@tundraconnect/cloudflare-kv/errors';

declare function writeRedirects(): Promise<unknown>;

try {
  await writeRedirects();
} catch (err) {
  if (err instanceof CloudflareKVRateLimitError) {
    // retries ran out; Cloudflare asked for this long
    console.log(err.retryAfterSeconds);
  } else if (err instanceof CloudflareKVError && err.transient) {
    // 5xx, network, timeout — try again later
  }
  throw err;
}
```

## Properties

| Property            | Type                    | Description                                                                   |
| ------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| `code`              | `CloudflareKVErrorCode` | Stable code from the table below.                                             |
| `transient`         | `boolean`               | `true` for `TIMEOUT`, `NETWORK_ERROR`, `SERVICE_UNAVAILABLE`, `RATE_LIMITED`. |
| `status`            | `number \| undefined`   | HTTP status, when Cloudflare answered.                                        |
| `vendorCode`        | `number \| undefined`   | Cloudflare's `errors[0].code`, when given.                                    |
| `retryAfterSeconds` | `number \| undefined`   | `CloudflareKVRateLimitError` only: the `Retry-After` hint.                    |

`getContextValue()` adds `detail` (Cloudflare's message and code),
`errors` (the full `errors` array), `retryAfterSeconds`, `bulk` (progress
of a split bulk call), and for limit errors `key`, `bytes` and `limit`.
Credentials never appear in a message or context.

## Codes

| Code                          | Raised when                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `CONFIG_INVALID_AUTH`         | `auth` is missing, a `BEARER` token is blank, or a `CUSTOM` auth lacks `email` or `key`.                                                   |
| `CONFIG_INVALID_ACCOUNT_ID`   | `accountId` is missing, blank or not an identifier.                                                                                        |
| `CONFIG_INVALID_NAMESPACE_ID` | A `namespaceId` option is given but blank or not an identifier.                                                                            |
| `CONFIG_INVALID_RETRY`        | A `retry` policy is out of range, or `maxRetryWait` / `defaultRetryWait` was passed.                                                       |
| `REQUEST_VALIDATION_ERROR`    | A query, title, timeout or argument fails local validation, or no namespace id: nothing sent.                                              |
| `KEY_INVALID`                 | A key is empty, not a string, `.` or `..`: nothing sent.                                                                                   |
| `KEY_TOO_LONG`                | A key is over 512 UTF-8 bytes: nothing sent.                                                                                               |
| `VALUE_TOO_LARGE`             | A value is over 25 MiB (a base64 bulk value is measured decoded): nothing sent.                                                            |
| `METADATA_INVALID`            | Metadata does not serialize to JSON (a `BigInt`, a cycle, a function): nothing sent.                                                       |
| `METADATA_TOO_LARGE`          | Metadata serializes to over 1024 bytes: nothing sent.                                                                                      |
| `EXPIRATION_INVALID`          | `expiration_ttl` under 60 or fractional, `expiration` not a positive integer, or both given.                                               |
| `INVALID_REQUEST`             | Any 4xx with no recognised code — e.g. a namespace title already in use.                                                                   |
| `AUTH_FAILED`                 | Cloudflare codes 6111, 9103, 9106, 9109, 10000 (on a non-403), or HTTP 401.                                                                |
| `FORBIDDEN`                   | Code 10000 on HTTP 403 (credentials lack the permission), or any other HTTP 403.                                                           |
| `NOT_FOUND`                   | Code 10009 for an unknown namespace, 7000 / 7003 (no such route — an unknown account), or HTTP 404. A missing **key** is `null`, not this. |
| `CONFLICT`                    | HTTP 409.                                                                                                                                  |
| `RATE_LIMITED`                | HTTP 429 after the retries ran out (`CloudflareKVRateLimitError`).                                                                         |
| `TIMEOUT`                     | No answer within the call's `timeout`.                                                                                                     |
| `NETWORK_ERROR`               | `fetch` failed before any response (DNS, TLS, connection reset).                                                                           |
| `SERVICE_UNAVAILABLE`         | HTTP 5xx.                                                                                                                                  |
| `RESPONSE_ERROR`              | A success body that fails the endpoint's schema, a `type: 'json'` read of a non-JSON value, or a repeated list cursor.                     |
| `UNKNOWN_ERROR`               | An unrecognised code passed in, or a failure with no classifiable status (`success: false` on a 2xx).                                      |

---

[← Back to CloudflareKV](../README.md)
