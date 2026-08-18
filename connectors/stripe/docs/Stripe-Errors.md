# Stripe Errors

Stripe throws `StripeError` for invalid configuration, local request
validation failures, documented vendor responses, and malformed payloads.

```ts
import { StripeError, StripeErrorCodes } from '@tundraconnect/stripe/errors';

const error = new StripeError('CARD_DECLINED', {
  vendorMessage: 'Your card was declined.',
});
console.log(error.message);
console.log(StripeErrorCodes.CARD_DECLINED);
```

## Vendor error mapping

Stripe's error envelope is `{ error: { type, code, message, param, ... } }`.
`error.type` is a closed, 4-value documented enum (`api_error`,
`card_error`, `idempotency_error`, `invalid_request_error`) — too coarse to
dispatch on directly (every declined card is `card_error`, regardless of
why). This connect instead keys primarily off the **HTTP status**,
refining with `error.code` when Stripe supplies one of the documented
values it recognises. `error.code` is checked first (more specific);
the HTTP status is the fallback.

## Codes

| Code                        | Meaning                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `CONFIG_INVALID_SECRET_KEY` | `auth` is missing, isn't `type: 'BASIC'`, or its `username` (the secret key) is empty or doesn't start with `sk_`/`rk_`. |
| `INVALID_REQUEST`           | Request options failed local Guardian validation.                                                                        |
| `RESPONSE_ERROR`            | The response body (success or error) failed schema validation.                                                           |
| `SERVICE_UNAVAILABLE`       | A 5xx response, or an error body that failed to parse at all.                                                            |
| `AUTHENTICATION_ERROR`      | Status 401, no more specific `error.code` — invalid/revoked key.                                                         |
| `PERMISSION_ERROR`          | Status 403 — the key lacks permission for this request.                                                                  |
| `RESOURCE_MISSING`          | Status 404, or `error.code = resource_missing`.                                                                          |
| `IDEMPOTENCY_ERROR`         | Status 409 — conflicting idempotency key reuse.                                                                          |
| `RATE_LIMITED`              | Status 429, or `error.code = rate_limit`.                                                                                |
| `CARD_ERROR`                | Status 402, no more specific `error.code`.                                                                               |
| `INVALID_REQUEST_ERROR`     | Status 400, no more specific `error.code`.                                                                               |
| `CARD_DECLINED`             | `error.code = card_declined`.                                                                                            |
| `PARAMETER_MISSING`         | `error.code = parameter_missing`.                                                                                        |
| `PARAMETER_INVALID_EMPTY`   | `error.code = parameter_invalid_empty`.                                                                                  |
| `EXPIRED_CARD`              | `error.code = expired_card`.                                                                                             |
| `INCORRECT_CVC`             | `error.code = incorrect_cvc`.                                                                                            |
| `INCORRECT_NUMBER`          | `error.code = incorrect_number`.                                                                                         |
| `PROCESSING_ERROR`          | `error.code = processing_error`.                                                                                         |
| `API_KEY_EXPIRED`           | `error.code = api_key_expired`.                                                                                          |
| `AUTHENTICATION_REQUIRED`   | `error.code = authentication_required` (e.g. 3D Secure needed).                                                          |
| `UNKNOWN_ERROR`             | An unknown constructor code was supplied.                                                                                |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof StripeError && error.code === 'CARD_DECLINED') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, `vendorType`, `vendorCode`, `vendorMessage`, `param`,
`declineCode`, or `docUrl` (Stripe's
[error-codes reference](https://docs.stripe.com/error-codes) URL, when the
vendor supplies one).

---

[← Back to Stripe](../README.md)
