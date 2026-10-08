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

| Code                       | Raised when                                                          |
| -------------------------- | -------------------------------------------------------------------- |
| `REQUEST_VALIDATION_ERROR` | Arguments failed local validation — nothing was sent.                |
| `RESPONSE_ERROR`           | A successful response's body didn't match the expected schema.       |
| `TIMEOUT`                  | No complete answer within the `timeout` (context `timeoutSeconds`).  |
| `NETWORK_ERROR`            | The request failed before any response (DNS, TLS, connection reset). |

`TIMEOUT`, `NETWORK_ERROR`, `SERVICE_UNAVAILABLE` and `RATE_LIMITED` are
**transient**: Dodo Payments gave no definite answer, so the same call may
succeed later. `err.transient` is `true` for exactly these and `false` for
every other code (a definite refusal or a misconfiguration retrying won't
fix). The set is also exported as `DODO_PAYMENTS_TRANSIENT_CODES` from
`@tundraconnect/dodo-payments/errors`.

## Vendor codes

Classification is driven by HTTP status, which is the part Dodo documents
as stable. The vendor's own `code` is preserved as the `vendorCode`
context value.

| HTTP          | `code`                |
| ------------- | --------------------- |
| 400, 422      | `INVALID_REQUEST`     |
| 401           | `AUTH_FAILED`         |
| 403           | `FORBIDDEN`           |
| 404, 410      | `NOT_FOUND`           |
| 409           | `CONFLICT`            |
| 429           | `RATE_LIMITED`        |
| 5xx           | `SERVICE_UNAVAILABLE` |
| anything else | `UNKNOWN_ERROR`       |

`CONFLICT` is what `changePlan` gets while a plan change is still pending
(vendor code `PendingPlanChangeExists`), and what `unarchiveProduct` gets
for a product that is not archived. `410` is Dodo's answer for a deleted
product.

Discount failures arrive as `INVALID_REQUEST` and are told apart by
`vendorCode`: `DISCOUNT_CODE_ALREADY_EXISTS` on `createDiscount`,
`DISCOUNT_CODE_EXPIRED` or `DISCOUNT_CODE_USAGE_LIMIT_EXCEEDED` from
`getDiscountByCode`, and the redemption codes (`DISCOUNT_NOT_YET_ACTIVE`,
`DISCOUNT_CUSTOMER_NOT_ELIGIBLE`, `DISCOUNT_MINIMUM_SUBTOTAL_NOT_MET`, …)
from a create or plan-change call that carries `discount_codes`. Dodo
answers two redemptions racing for a code's last use with a 503
(`DISCOUNT_CONCURRENT_REDEMPTION`), which arrives as a transient
`SERVICE_UNAVAILABLE`: retry it.

Refund failures arrive as `INVALID_REQUEST` and are told apart by
`vendorCode`: `REFUND_WINDOW_EXPIRED`, `PAYMENT_NOT_SUCCEEDED`,
`EXISTING_REFUND_REQUEST_PROCESSING` (one is still `pending` or `review`),
`REFUND_AMOUNT_EXCEEDS_PAID_AMOUNT`, `PAYMENT_HAS_BEEN_REFUNDED`,
`NOTHING_TO_REFUND`, `PARTIAL_REFUND_NOT_ALLOWED`, and the per-line
`LINE_ITEM_NOT_FOUND`, `LINE_ITEM_FULLY_REFUNDED`,
`LINE_ITEM_REFUND_AMOUNT_TOO_HIGH` and `LINE_ITEM_REFUND_AMOUNT_TOO_LOW`.
`createRefund` for an unknown payment is `NOT_FOUND`.

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

| Key              | Present on                   | Description                               |
| ---------------- | ---------------------------- | ----------------------------------------- |
| `vendor`         | all                          | Always `'DodoPayments'`.                  |
| `status`         | vendor failures              | HTTP status code.                         |
| `detail`         | vendor failures              | Vendor message plus its code.             |
| `vendorCode`     | documented-envelope failures | Dodo's own error code.                    |
| `body`           | vendor failures              | The parsed response body.                 |
| `reason`         | validation / webhook codes   | Which rule failed.                        |
| `timeoutSeconds` | `TIMEOUT`                    | The deadline that was missed, in seconds. |
| `originalCode`   | `UNKNOWN_ERROR` fallback     | The unrecognized code passed in.          |

Neither the API key nor the webhook signing secret ever appears in an
error's message or context.

## Backing off after a 429

A rate-limited request throws `RATE_LIMITED`. Two context values tell you what to
do next:

| Context             | Meaning                                                                                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retryAfterSeconds` | Seconds the vendor asked you to wait, parsed by RESTler from `Retry-After` (delta seconds or an HTTP-date), `X-RateLimit-Reset-After`, `RateLimit-Reset`, or an epoch-seconds `X-RateLimit-Reset`. `undefined` when the response carried none — never a guess. |
| `retried`           | Set only when `maxRetryWait` is configured: `true` if RESTler already waited once and was throttled again, `false` if it did not wait (the hint exceeded the cap, or there was no hint to wait on).                                                            |

Nothing is retried by default. Opt in with two client options (seconds,
each `0`–`120`):

- **`maxRetryWait`** — when a 429 carries a hint no longer than this,
  RESTler waits that long and retries **once**; otherwise it throws
  `RATE_LIMITED` immediately. `0` disables the retry.
- **`defaultRetryWait`** — the wait used when a 429 carries **no** hint.
  Without it a hintless 429 is never retried: RESTler does not invent a
  delay. Only consulted when `maxRetryWait` is set, and still capped by it.

---

[← Back to DodoPayments](../README.md)
