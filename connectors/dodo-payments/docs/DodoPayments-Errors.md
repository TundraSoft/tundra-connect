# DodoPayments Errors

Every failure from `@tundraconnect/dodo-payments` is a
`DodoPaymentsError`, including request-validation, response-validation and
webhook-verification failures. Branch on the readonly `code` property —
never on a message substring.

```ts
import { DodoPaymentsError } from '@tundraconnect/dodo-payments/errors';

try {
  await client.getPayment(id);
} catch (err) {
  if (err instanceof DodoPaymentsError && err.code === 'NOT_FOUND') {
    return null;
  }
  throw err;
}
```

## Configuration codes

| Code                     | Raised when                                               |
| ------------------------ | --------------------------------------------------------- |
| `CONFIG_INVALID_API_KEY` | `auth` is missing, isn't `BEARER`, or its token is blank. |
| `CONFIG_INVALID_MODE`    | `mode` is neither `'test'` nor `'live'`.                  |

## Request / response codes

| Code                       | Raised when                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `REQUEST_VALIDATION_ERROR` | Arguments failed local validation — nothing was sent.          |
| `RESPONSE_ERROR`           | A successful response's body didn't match the expected schema. |

## Vendor codes

Classification is driven by HTTP status, which is the part Dodo documents
as stable. The vendor's own `code` is preserved as the `vendorCode`
context value.

| HTTP          | `code`                |
| ------------- | --------------------- |
| 400, 422      | `INVALID_REQUEST`     |
| 401           | `AUTH_FAILED`         |
| 403           | `FORBIDDEN`           |
| 404           | `NOT_FOUND`           |
| 429           | `RATE_LIMITED`        |
| 5xx           | `SERVICE_UNAVAILABLE` |
| anything else | `UNKNOWN_ERROR`       |

A failure body that isn't the documented `{ code, message }` envelope — a
gateway 502 serving HTML, say — still classifies by status; `vendorCode` is
simply absent.

## Webhook codes

| Code                        | Raised when                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `WEBHOOK_INVALID_HEADERS`   | A required Standard Webhooks header is missing.                  |
| `WEBHOOK_TIMESTAMP_INVALID` | Unparseable timestamp, or outside the tolerance window.          |
| `WEBHOOK_SIGNATURE_INVALID` | No supplied signature matched — **treat the request as forged**. |
| `WEBHOOK_INVALID_SECRET`    | The signing secret isn't valid base64.                           |

`WEBHOOK_SIGNATURE_INVALID` is also what you get when the payload was
re-serialized rather than passed raw. That is intentional: a mismatch
between the bytes that were signed and the bytes you act on is exactly the
condition signature verification exists to catch.

## Rate limits

Dodo applies a dual-window limit (burst per second, sustained per minute)
and returns `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
`X-RateLimit-Reset`. Exceeding it surfaces as `RATE_LIMITED`.

## Diagnostic metadata

Read metadata with the public `getContextValue(key)`.

| Key            | Present on                   | Description                      |
| -------------- | ---------------------------- | -------------------------------- |
| `vendor`       | all                          | Always `'DodoPayments'`.         |
| `status`       | vendor failures              | HTTP status code.                |
| `detail`       | vendor failures              | Vendor message plus its code.    |
| `vendorCode`   | documented-envelope failures | Dodo's own error code.           |
| `body`         | vendor failures              | The parsed response body.        |
| `reason`       | validation / webhook codes   | Which rule failed.               |
| `originalCode` | `UNKNOWN_ERROR` fallback     | The unrecognized code passed in. |

Neither the API key nor the webhook signing secret ever appears in an
error's message or context.
