# PayPal Errors

`PayPal` throws `PayPalError` for local request validation, configuration
problems, the OAuth2 token exchange, and vendor responses — see
[errors/Base.ts](../errors/Base.ts) and
[errors/PayPalErrorCodes.ts](../errors/PayPalErrorCodes.ts).

```ts
import { PayPalError, PayPalErrorCodes } from '@tundraconnect/paypal/errors';

const error = new PayPalError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(error.message);
```

## Codes

| Code                           | Meaning                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `UNKNOWN_ERROR`                | An unmapped status was returned, or an unknown code was supplied.                                                                       |
| `CONFIG_MISSING_AUTH`          | The client was constructed without `auth` at all.                                                                                       |
| `CONFIG_INVALID_AUTH_TYPE`     | `auth.type` was not `'CUSTOM'`.                                                                                                         |
| `CONFIG_INVALID_CLIENT_ID`     | `auth.clientId` was missing or blank.                                                                                                   |
| `CONFIG_INVALID_CLIENT_SECRET` | `auth.clientSecret` was missing or blank. Its _value_ is never included in the error.                                                   |
| `CONFIG_INVALID_ENVIRONMENT`   | `auth.environment` was not `'sandbox'`/`'live'`.                                                                                        |
| `TOKEN_EXCHANGE_FAILED`        | The OAuth2 client-credentials exchange failed — bad credentials, a timeout, or a malformed token response.                              |
| `REQUEST_VALIDATION_ERROR`     | A request (`createOrder`/`refundCapture` body, or an `orderId`/`captureId`) failed local validation before anything was sent.           |
| `INVALID_ORDER_ID`             | `getOrder`/`captureOrder` was called with an empty or path-traversal-shaped `orderId`.                                                  |
| `INVALID_CAPTURE_ID`           | `refundCapture` was called with an empty or path-traversal-shaped `captureId`.                                                          |
| `INVALID_REQUEST`              | PayPal returned HTTP 400 — the request was malformed.                                                                                   |
| `AUTH_FAILED`                  | PayPal returned HTTP 401 on an API call — the access token was missing, expired, or invalid.                                            |
| `FORBIDDEN`                    | PayPal returned HTTP 403 — the authenticated app lacks permission.                                                                      |
| `NOT_FOUND`                    | PayPal returned HTTP 404 — the order or capture doesn't exist.                                                                          |
| `CONFLICT`                     | PayPal returned HTTP 409 — the request conflicts with the resource's current state.                                                     |
| `UNSUPPORTED_MEDIA_TYPE`       | PayPal returned HTTP 415.                                                                                                               |
| `PAYER_ACTION_REQUIRED`        | A 422 with vendor `details[].issue === 'PAYER_ACTION_REQUIRED'` — the payer must return to PayPal before this transaction can complete. |
| `ACTION_DOES_NOT_MATCH_INTENT` | A 422 with vendor `details[].issue === 'ACTION_DOES_NOT_MATCH_INTENT'` — e.g. calling `captureOrder` on an `AUTHORIZE`-intent order.    |
| `VALIDATION_ERROR`             | Any other HTTP 422 — a documented `issue`/`vendorMessage` is preserved in context (see below).                                          |
| `RATE_LIMITED`                 | PayPal returned HTTP 429.                                                                                                               |
| `RESPONSE_ERROR`               | A success response's body failed schema validation.                                                                                     |
| `SERVICE_UNAVAILABLE`          | PayPal returned a 5xx (or another unrecognized ≥500) status.                                                                            |

Only the two `details[].issue` values confirmed against PayPal's published
OpenAPI spec response examples (`PAYER_ACTION_REQUIRED`,
`ACTION_DOES_NOT_MATCH_INTENT`) get their own code — PayPal documents many
more issue values than practical to enumerate here, so every other 422 maps
to `VALIDATION_ERROR` with the vendor's `issue` and `message` preserved in
context instead (`error.getContextValue('issue')`).

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
try {
  await client.captureOrder(orderId);
} catch (error) {
  if (error instanceof PayPalError && error.code === 'PAYER_ACTION_REQUIRED') {
    // redirect the payer back to PayPal to complete the action
  } else if (
    error instanceof PayPalError && error.code === 'VALIDATION_ERROR'
  ) {
    console.log(
      error.getContextValue('issue'),
      error.getContextValue('vendorMessage'),
    );
  }
}
```

Use `getContextValue()` to read diagnostic metadata (`status`, `body`,
`vendorName`, `vendorMessage`, `debugId`, `issue`, `details`, ...) — see
[errors/Base.ts](../errors/Base.ts). `auth.clientSecret`'s value is never
placed into any error's context, including on a `TOKEN_EXCHANGE_FAILED` —
only its absence/emptiness is ever reported.

---

[← Back to PayPal](../README.md)
