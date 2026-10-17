# GoogleCertificateManager Errors

Every failure `@tundraconnect/google-certificate-manager` throws is a
`GoogleCertificateManagerError`. Branch on its readonly `code`. Use
`transient` to tell "try again later" from a definite failure. Diagnostic
detail is in `getContextValue()`. Credentials never appear in a message or
in the context.

```ts
import { GoogleCertificateManagerError } from '@tundraconnect/google-certificate-manager/errors';

const err = new GoogleCertificateManagerError('NOT_FOUND', {
  status: 404,
  detail: 'Resource not found',
});
console.log(err.code, err.transient, err.getContextValue('status'));
```

## Codes

| Code                             | When                                                                     | `transient` |
| -------------------------------- | ------------------------------------------------------------------------ | ----------- |
| `CONFIG_INVALID_AUTH`            | `auth` missing, of another type, or a blank token.                       | no          |
| `CONFIG_INVALID_SERVICE_ACCOUNT` | Service-account `clientEmail` or `privateKey` missing.                   | no          |
| `CONFIG_INVALID_PROJECT`         | `projectId`, `location` or `certificateMapId` missing or malformed.      | no          |
| `JWT_SIGNING_FAILED`             | `privateKey` is not a usable PKCS8 RSA key.                              | no          |
| `TOKEN_EXCHANGE_FAILED`          | The token endpoint refused the JWT (4xx), or answered malformed JSON.    | no          |
| `REQUEST_VALIDATION_ERROR`       | Bad input caught before sending: an id, a hostname, an empty list.       | no          |
| `INVALID_REQUEST`                | `INVALID_ARGUMENT` / `OUT_OF_RANGE`, or another 4xx without an envelope. | no          |
| `FAILED_PRECONDITION`            | Wrong state for the call, e.g. deleting a certificate still in use.      | no          |
| `AUTH_FAILED`                    | `UNAUTHENTICATED` / 401.                                                 | no          |
| `PERMISSION_DENIED`              | `PERMISSION_DENIED` / 403: IAM, or the API is not enabled.               | no          |
| `NOT_FOUND`                      | `NOT_FOUND` / 404.                                                       | no          |
| `ALREADY_EXISTS`                 | `ALREADY_EXISTS` (409).                                                  | no          |
| `CONFLICT`                       | `ABORTED` (409), or a 409 without an envelope.                           | yes         |
| `RATE_LIMITED`                   | A rate limit: see below.                                                 | yes         |
| `QUOTA_EXCEEDED`                 | A resource quota: see below.                                             | no          |
| `SERVICE_UNAVAILABLE`            | `UNAVAILABLE` / `INTERNAL` / `DEADLINE_EXCEEDED`, any 5xx.               | yes         |
| `TIMEOUT`                        | No answer within `timeout` (API or token endpoint).                      | yes         |
| `NETWORK_ERROR`                  | No response at all: DNS, TLS, connection reset.                          | yes         |
| `OPERATION_TIMEOUT`              | `waitForOperation` reached `timeoutSeconds` with the operation running.  | yes         |
| `RESPONSE_ERROR`                 | A success body that does not match the schema.                           | no          |
| `UNKNOWN_ERROR`                  | Anything unmapped.                                                       | no          |

## How a failure is classified

An HTTP error is mapped by the canonical `status` in Google's envelope
(`{ error: { code, message, status, details } }`) first, and by the HTTP
status when the body is not that envelope (a load balancer's HTML 502, say).

`RESOURCE_EXHAUSTED` covers two different things. It becomes `RATE_LIMITED`
when Google tags it with the `RATE_LIMIT_EXCEEDED` reason or sends a
`Retry-After` hint. Otherwise it becomes `QUOTA_EXCEEDED`: a resource-count
quota, which retrying will not clear.

A failed long-running operation carries a numeric `google.rpc.Code`.
`waitForOperation` maps it onto the same codes: 6 → `ALREADY_EXISTS`,
5 → `NOT_FOUND`, 7 → `PERMISSION_DENIED`, 9 → `FAILED_PRECONDITION`,
3/11 → `INVALID_REQUEST`, 8 → `QUOTA_EXCEEDED`, 10 → `CONFLICT`,
4/13/14 → `SERVICE_UNAVAILABLE`, 16 → `AUTH_FAILED`; anything else is
`UNKNOWN_ERROR`.

The token endpoint's own failures follow the same idea: a 5xx is
`SERVICE_UNAVAILABLE` and a 429 is `RATE_LIMITED` (both transient); any
other refusal is `TOKEN_EXCHANGE_FAILED`.

## Context

| Key                 | Present on                     | Meaning                                                    |
| ------------------- | ------------------------------ | ---------------------------------------------------------- |
| `status`            | HTTP errors                    | The HTTP status (`null` for a failed operation).           |
| `detail`            | vendor and operation errors    | Google's message.                                          |
| `vendorStatus`      | vendor and operation errors    | The canonical status name, e.g. `ALREADY_EXISTS`.          |
| `vendorReason`      | vendor errors with `ErrorInfo` | e.g. `RATE_LIMIT_EXCEEDED`, `SERVICE_DISABLED`.            |
| `vendorCode`        | operation errors               | The numeric `google.rpc.Code`.                             |
| `operation`         | operation errors, timeouts     | The operation's full name, to poll again later.            |
| `retryAfterSeconds` | rate limits                    | Google's `Retry-After` hint.                               |
| `retried`           | `RATE_LIMITED` via RESTler     | Whether RESTler's single `maxRetryWait` retry already ran. |
| `vendorError`       | token endpoint errors          | The OAuth `error`, e.g. `invalid_grant`.                   |
| `reason`            | `REQUEST_VALIDATION_ERROR`     | Which input was wrong and why.                             |
| `responseError`     | `RESPONSE_ERROR`               | The Guardian validation error.                             |
