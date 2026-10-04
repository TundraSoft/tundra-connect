# PayPal Errors

`PayPal` throws `PayPalError` for local request validation, configuration
problems, the OAuth2 token exchange, vendor responses, timeouts and network
failures — one `instanceof` covers everything. See
[errors/Base.ts](../errors/Base.ts) and
[errors/PayPalErrorCodes.ts](../errors/PayPalErrorCodes.ts).

```ts
import { PayPalError, PayPalErrorCodes } from '@tundraconnect/paypal/errors';

const error = new PayPalError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(error.message);
```

## Codes

| Code                           | Transient | Meaning                                                                                                                                                                                |
| ------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UNKNOWN_ERROR`                | no        | An unmapped status was returned, or an unknown code was supplied.                                                                                                                      |
| `CONFIG_MISSING_AUTH`          | no        | The client was constructed without `auth` at all.                                                                                                                                      |
| `CONFIG_INVALID_AUTH_TYPE`     | no        | `auth.type` was not `'CUSTOM'`.                                                                                                                                                        |
| `CONFIG_INVALID_CLIENT_ID`     | no        | `auth.clientId` was missing or blank.                                                                                                                                                  |
| `CONFIG_INVALID_CLIENT_SECRET` | no        | `auth.clientSecret` was missing or blank. Its _value_ is never included in the error.                                                                                                  |
| `CONFIG_INVALID_ENVIRONMENT`   | no        | `auth.environment` was not `'sandbox'`/`'live'`.                                                                                                                                       |
| `TOKEN_EXCHANGE_FAILED`        | no        | The OAuth2 token endpoint refused the credentials (non-2xx; `status`/`body` in context) or returned a malformed token. A transport failure there is `TIMEOUT`/`NETWORK_ERROR` instead. |
| `REQUEST_VALIDATION_ERROR`     | no        | A request (`createOrder`/`refundCapture` body, or an `orderId`/`captureId`) failed local validation before anything was sent.                                                          |
| `INVALID_ORDER_ID`             | no        | `getOrder`/`captureOrder` was called with an empty or path-traversal-shaped `orderId`.                                                                                                 |
| `INVALID_CAPTURE_ID`           | no        | `refundCapture` was called with an empty or path-traversal-shaped `captureId`.                                                                                                         |
| `INVALID_REQUEST`              | no        | PayPal returned HTTP 400 — the request was malformed.                                                                                                                                  |
| `AUTH_FAILED`                  | no        | PayPal returned HTTP 401 on an API call — the access token was missing, expired, or invalid.                                                                                           |
| `FORBIDDEN`                    | no        | PayPal returned HTTP 403 — the authenticated app lacks permission.                                                                                                                     |
| `NOT_FOUND`                    | no        | PayPal returned HTTP 404 — the order or capture doesn't exist.                                                                                                                         |
| `CONFLICT`                     | no        | PayPal returned HTTP 409 — the request conflicts with the resource's current state.                                                                                                    |
| `UNSUPPORTED_MEDIA_TYPE`       | no        | PayPal returned HTTP 415.                                                                                                                                                              |
| `PAYER_ACTION_REQUIRED`        | no        | A 422 with vendor `details[].issue === 'PAYER_ACTION_REQUIRED'` — the payer must return to PayPal before this transaction can complete.                                                |
| `ACTION_DOES_NOT_MATCH_INTENT` | no        | A 422 with vendor `details[].issue === 'ACTION_DOES_NOT_MATCH_INTENT'` — e.g. calling `captureOrder` on an `AUTHORIZE`-intent order.                                                   |
| `VALIDATION_ERROR`             | no        | Any other HTTP 422 — a documented `issue`/`vendorMessage` is preserved in context (see below).                                                                                         |
| `RATE_LIMITED`                 | **yes**   | PayPal returned HTTP 429.                                                                                                                                                              |
| `TIMEOUT`                      | **yes**   | No response within the `timeout` (seconds; `timeoutSeconds` in context), including during the OAuth2 token exchange.                                                                   |
| `NETWORK_ERROR`                | **yes**   | `fetch` failed before any response (DNS, TLS, connection reset), including during the OAuth2 token exchange. The original is the `cause`.                                              |
| `RESPONSE_ERROR`               | no        | A success response's body failed schema validation.                                                                                                                                    |
| `SERVICE_UNAVAILABLE`          | **yes**   | PayPal returned a 5xx (or another unrecognized ≥500) status.                                                                                                                           |

`error.transient` is `true` for exactly the codes marked **yes** above —
`TIMEOUT`, `NETWORK_ERROR`, `RATE_LIMITED` and `SERVICE_UNAVAILABLE` — and
`false` for a definite refusal or a misconfiguration. Branch on it to tell
"no answer yet, retry later" from "PayPal said no". The set is also exported
as `PAYPAL_TRANSIENT_CODES` from `@tundraconnect/paypal/errors`.

```ts
if (error instanceof PayPalError && error.transient) {
  // keep the payment pending and try again later
}
```

### Token exchange

A token exchange that gets no answer surfaces as the transient `TIMEOUT` or
`NETWORK_ERROR`, and one throttled past `maxRetryWait` as `RATE_LIMITED`.
Earlier releases reported all three as `TOKEN_EXCHANGE_FAILED` (with
`reason: 'timeout'` or `'request failed'`). `TOKEN_EXCHANGE_FAILED` now means
the token endpoint answered and refused, or returned a malformed token. It is
not transient.

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
`vendorName`, `vendorMessage`, `debugId`, `issue`, `details`,
`timeoutSeconds` on `TIMEOUT`, ...) — see
[errors/Base.ts](../errors/Base.ts). `auth.clientSecret`'s value is never
placed into any error's context, including on a `TOKEN_EXCHANGE_FAILED` —
only its absence/emptiness is ever reported.

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

[← Back to PayPal](../README.md)

## Webhook codes

| Code                        | Raised when                                                                    |
| --------------------------- | ------------------------------------------------------------------------------ |
| `WEBHOOK_INVALID_HEADERS`   | A required signature header is missing.                                        |
| `WEBHOOK_SIGNATURE_INVALID` | **Treat the request as forged.** Also PayPal answering anything but `SUCCESS`. |
