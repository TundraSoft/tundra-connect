# Resend Errors

Every failure from `@tundraconnect/resend` is a `ResendError`, including
response-validation and webhook-verification failures. Branch on the
readonly `code` property — never on a message substring.

```ts
import { Resend } from '@tundraconnect/resend';
import { ResendError } from '@tundraconnect/resend/errors';

const client = new Resend({ auth: { type: 'BEARER', token: 're_123' } });

try {
  await client.send({
    from: 'a@yourdomain.com',
    to: 'b@example.com',
    subject: 'Hi',
    text: 'Hi',
  });
} catch (err) {
  if (err instanceof ResendError && err.code === 'RATE_LIMITED') {
    console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
  }
  throw err;
}
```

## Codes

| Code                        | Raised when                                                                    |
| --------------------------- | ------------------------------------------------------------------------------ |
| `CONFIG_INVALID_API_KEY`    | `auth` is missing, isn't `BEARER`, or its `token` is blank.                    |
| `REQUEST_VALIDATION_ERROR`  | Arguments failed local validation — nothing was sent.                          |
| `INVALID_REQUEST`           | Resend rejected the request's fields or parameters.                            |
| `AUTH_FAILED`               | The API key is missing, invalid, or sending-only for a full-access call.       |
| `FORBIDDEN`                 | The key is suspended, inactive, lacks a scope, or the domain isn't allowed.    |
| `NOT_FOUND`                 | No such email (or endpoint).                                                   |
| `IDEMPOTENCY_CONFLICT`      | The idempotency key is in flight elsewhere, or was used with a different body. |
| `CONFLICT`                  | Another request is already updating the resource.                              |
| `QUOTA_EXCEEDED`            | The daily or monthly sending quota is exhausted.                               |
| `RATE_LIMITED`              | Too many requests per second.                                                  |
| `SERVICE_UNAVAILABLE`       | Resend returned a 5xx.                                                         |
| `RESPONSE_ERROR`            | A successful response's body did not match the expected schema.                |
| `WEBHOOK_INVALID_HEADERS`   | A `svix-id` / `svix-timestamp` / `svix-signature` header is missing.           |
| `WEBHOOK_TIMESTAMP_INVALID` | The timestamp is not Unix seconds, or is outside the tolerance window.         |
| `WEBHOOK_SIGNATURE_INVALID` | No `v1` signature matches the payload and secret.                              |
| `WEBHOOK_INVALID_SECRET`    | The signing secret is empty or not base64.                                     |
| `WEBHOOK_INVALID_PAYLOAD`   | The verified body is not JSON, or not a `{ type, created_at, data }` event.    |
| `UNKNOWN_ERROR`             | Any unmapped failure, or an unrecognized code passed to the constructor.       |

## Vendor error mapping

Resend's error body is `{ statusCode, name, message }`. `name` is mapped
onto a stable code and kept in the error's context as `vendorName`:

| Resend `name`                                                                                                                                                          | `code`                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `validation_error`, `invalid_idempotency_key`, `invalid_attachment`, `invalid_parameter`, `missing_required_field`, `missing_required_parameter`, `method_not_allowed` | `INVALID_REQUEST`      |
| `missing_api_key`                                                                                                                                                      | `AUTH_FAILED`          |
| `invalid_permission`, `suspended_api_key`, `email_above_quota`                                                                                                         | `FORBIDDEN`            |
| `not_found`                                                                                                                                                            | `NOT_FOUND`            |
| `concurrent_idempotent_requests`, `invalid_idempotent_request`                                                                                                         | `IDEMPOTENCY_CONFLICT` |
| `resource_locked`                                                                                                                                                      | `CONFLICT`             |
| `daily_quota_exceeded`, `monthly_quota_exceeded`                                                                                                                       | `QUOTA_EXCEEDED`       |
| `rate_limit_exceeded`                                                                                                                                                  | `RATE_LIMITED`         |
| `application_error`, `service_unavailable`                                                                                                                             | `SERVICE_UNAVAILABLE`  |

Any other name — including `restricted_api_key`, which Resend returns at both
401 and 403 — falls back to HTTP status: 401 `AUTH_FAILED`, 403 `FORBIDDEN`,
404 `NOT_FOUND`, 409 `CONFLICT`, 429 `RATE_LIMITED`, 400/405/422
`INVALID_REQUEST`, 5xx `SERVICE_UNAVAILABLE`. A body that isn't Resend's (a
gateway error serving HTML) falls back the same way.

`validation_error` at 403 is how Resend reports an unverified sending domain;
it maps to `INVALID_REQUEST` with `status: 403` — read `detail` for the
reason.

## Context

| Key                 | Present on                                  | Meaning                                          |
| ------------------- | ------------------------------------------- | ------------------------------------------------ |
| `status`            | vendor errors                               | HTTP status.                                     |
| `vendorName`        | vendor errors with a Resend body            | Resend's error `name`.                           |
| `detail`            | vendor errors                               | `message (name)`, or `no detail`.                |
| `body`              | vendor errors                               | The raw response body.                           |
| `retryAfterSeconds` | `RATE_LIMITED` / any error with a hint      | Parsed `Retry-After`.                            |
| `retried`           | `RATE_LIMITED` via `maxRetryWait`           | Whether RESTler already waited and retried once. |
| `reason`            | `REQUEST_VALIDATION_ERROR`, webhook codes   | What failed.                                     |
| `index`             | `REQUEST_VALIDATION_ERROR` from `sendBatch` | Position of the offending email.                 |
| `responseError`     | validation codes                            | The Guardian error, serialized.                  |

## Rate limits

Resend allows 10 requests per second per team. With `maxRetryWait` set,
RESTler waits out a 429's `Retry-After` hint (if within the cap) and retries
once; when that fails, or the hint exceeds the cap, the result is
`RATE_LIMITED` with `retried` and `retryAfterSeconds`. Note that RESTler
retries **any** 429 on this path — including a quota exhaustion — and the
rewrapped error is then `RATE_LIMITED` rather than `QUOTA_EXCEEDED`. Without
`maxRetryWait`, a 429 is mapped directly by its `name`.
