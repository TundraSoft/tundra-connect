# Razorpay Errors

`Razorpay` throws `RazorpayError` for invalid configuration, local request
validation failures, documented vendor responses, and malformed payloads
— see [errors/Base.ts](../errors/Base.ts) and
[errors/RazorpayErrorCodes.ts](../errors/RazorpayErrorCodes.ts).

```ts
import {
  RazorpayError,
  RazorpayErrorCodes,
} from '@tundraconnect/razorpay/errors';

const error = new RazorpayError('BAD_REQUEST_ERROR', {
  status: 400,
  vendorDescription: 'The amount must be at least INR 1.00',
});
console.log(error.message);
console.log(RazorpayErrorCodes.BAD_REQUEST_ERROR);
```

## Vendor error mapping

Razorpay's error envelope is `{ error: { code, description, field, source,
step, reason, metadata } }`
([About Errors](https://razorpay.com/docs/errors/)). `error.code` is a
small, closed set of top-level values shared across Razorpay's APIs
([Error Types](https://razorpay.com/docs/errors/x/)): `BAD_REQUEST_ERROR`,
`GATEWAY_ERROR`, `SERVER_ERROR`, and `SERVICE_UNAVAILABLE`. This connect
checks `error.code` first (more specific) and falls back to the HTTP
status when the vendor's code isn't one of those four, or the error body
couldn't be parsed at all.

## Codes

| Code                  | Meaning                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_INVALID_AUTH` | `auth` is missing, isn't `type: 'BASIC'`, `username` isn't a validly-shaped `key_id`, or `password` (the `key_secret`) is empty.   |
| `INVALID_REQUEST`     | Request options (or a path parameter like an id) failed local Guardian validation.                                                 |
| `RESPONSE_ERROR`      | The response body (success or error) failed schema validation.                                                                     |
| `BAD_REQUEST_ERROR`   | `error.code = BAD_REQUEST_ERROR` (invalid request data — the majority of business/validation failures), or an unmapped 4xx status. |
| `GATEWAY_ERROR`       | `error.code = GATEWAY_ERROR` — the request failed at the payment gateway or downstream bank, or an unmapped 502.                   |
| `SERVER_ERROR`        | `error.code = SERVER_ERROR` — an internal Razorpay failure, or an unmapped 5xx status.                                             |
| `SERVICE_UNAVAILABLE` | `error.code = SERVICE_UNAVAILABLE`, an unmapped 503, or an error body that failed to parse at all on a 5xx response.               |
| `UNKNOWN_ERROR`       | An unknown constructor code was supplied.                                                                                          |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof RazorpayError && error.code === 'GATEWAY_ERROR') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, `vendorCode`, `vendorDescription`, and Razorpay's own `field`,
`source`, `step`, `reason`, and `metadata` (preserved verbatim from the
vendor's error detail object when present).

`key_secret` (the credential's `auth.password`) is never interpolated
into a message template or stored as context on any thrown error — even
when the configured value fails validation.

---

[← Back to Razorpay](../README.md)

## Webhook codes

| Code                        | Raised when                             |
| --------------------------- | --------------------------------------- |
| `WEBHOOK_INVALID_HEADERS`   | A required signature header is missing. |
| `WEBHOOK_SIGNATURE_INVALID` | **Treat the request as forged.**        |

## Backing off after a 429

`getContextValue('retryAfterSeconds')` — seconds to wait before retrying, read from whichever header the vendor sent: `Retry-After` (delta seconds or an HTTP-date), `X-RateLimit-Reset-After`, or `X-RateLimit-Reset` / `RateLimit-Reset` (a Unix epoch in seconds or milliseconds). `undefined` when none was present — the value is only ever what the vendor said, never a guess. Present on `RATE_LIMITED` when the vendor sent a usable hint.

## Rate limiting

| Code           | Raised when                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `RATE_LIMITED` | HTTP 429. Read `retryAfterSeconds` from the error context and back off; never retry immediately. |
