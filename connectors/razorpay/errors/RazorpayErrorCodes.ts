/**
 * Razorpay error-code to message-template map.
 *
 * Razorpay's error envelope (`{ error: { code, description, field, source,
 * step, reason, metadata } }`, see https://razorpay.com/docs/api/errors/ and
 * https://razorpay.com/docs/errors/) documents a small, closed set of
 * top-level `error.code` values shared across its APIs
 * (https://razorpay.com/docs/errors/x/): `BAD_REQUEST_ERROR` (invalid
 * request data — the vast majority of business/validation failures),
 * `GATEWAY_ERROR` (the request failed at the payment gateway or downstream
 * bank), `SERVER_ERROR` (an internal Razorpay failure), and
 * `SERVICE_UNAVAILABLE` (a transient outage). This connect's mapping (see
 * `Razorpay.__toError`) checks `error.code` first (more specific) and falls
 * back to the HTTP status when the vendor's code isn't one of those four —
 * mirroring this repo's Stripe connect, which faces the same
 * status-vs-code ambiguity.
 */
export const RazorpayErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with Razorpay.',

  // Connect-specific: invalid client configuration, caught at construction.
  // Never interpolate the offending `key_secret` value here — it's a live
  // credential, and `.message` is the property most commonly logged
  // (console.error, Sentry, uncaught-exception handlers).
  CONFIG_INVALID_AUTH:
    "auth must be { type: 'BASIC', username: <key_id>, password: <key_secret> }, " +
    "with username starting with 'rzp_test_' or 'rzp_live_' and a non-empty password.",

  // Connect-specific: local request validation, caught before the call.
  INVALID_REQUEST: 'Request failed local validation: ${reason}',

  // Connect-specific: response body didn't match the expected schema, or
  // the error envelope itself couldn't be parsed.
  RESPONSE_ERROR:
    'The Razorpay API response did not match the expected schema.',

  // Vendor-documented top-level `error.code` values, reused verbatim as
  // this connect's own codes (see the module doc above for sources).
  BAD_REQUEST_ERROR:
    'Razorpay rejected the request as invalid (HTTP ${status}): ${vendorDescription}',
  GATEWAY_ERROR:
    'The request could not be completed due to an error at the payment gateway or downstream bank: ${vendorDescription}',
  SERVER_ERROR:
    'Razorpay encountered an internal error while processing the request: ${vendorDescription}',
  SERVICE_UNAVAILABLE:
    'The Razorpay service is currently unavailable (HTTP ${status}).',
} as const;

/** Valid Razorpay error code. */
export type RazorpayErrorCode = keyof typeof RazorpayErrorCodes;
