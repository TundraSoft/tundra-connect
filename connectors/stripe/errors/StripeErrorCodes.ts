/**
 * Stripe error-code to message-template map.
 *
 * Stripe's error envelope (`{ error: { type, code, message, ... } }`)
 * documents `type` as a closed 4-value enum (`api_error`, `card_error`,
 * `idempotency_error`, `invalid_request_error`) and a much larger, open set
 * of `code` values (https://docs.stripe.com/error-codes). Neither is a
 * reliable primary dispatch key on its own: `type` is too coarse (every
 * declined card is `card_error`, regardless of *why*) and not every error
 * carries a `code`. So this connect's mapping (see `Stripe.__toError`) keys
 * primarily off the HTTP status — the codes below prefixed with a status
 * note are that fallback — and refines with `error.code` when Stripe
 * supplies one of the documented values reused verbatim here.
 */
export const StripeErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while calling the Stripe API.',

  // Connect-specific: configuration failure, caught at construction. Never
  // interpolate the offending `secretKey` value here — Stripe secret keys
  // are live credentials, and `.message` is the property most commonly
  // logged (console.error, Sentry, uncaught-exception handlers).
  CONFIG_INVALID_SECRET_KEY:
    "secretKey must be a non-empty string starting with 'sk_' or 'rk_'.",

  // Connect-specific: local request validation, caught before the call.
  INVALID_REQUEST: 'Request failed local validation: ${reason}',

  // Connect-specific: response body didn't match the expected schema, or
  // the error envelope itself couldn't be parsed.
  RESPONSE_ERROR: 'The Stripe API response did not match the expected schema.',
  SERVICE_UNAVAILABLE:
    'The Stripe service is currently unavailable (status ${status}).',

  // HTTP-status-derived fallbacks, used when no more specific `error.code`
  // mapping below applies.
  AUTHENTICATION_ERROR:
    'Authentication failed (status ${status}) — the secret key is invalid, revoked, or missing.',
  PERMISSION_ERROR:
    'The API key does not have permission to perform this request (status ${status}).',
  RESOURCE_MISSING: 'The requested resource was not found (status ${status}).',
  IDEMPOTENCY_ERROR:
    'The request conflicts with a previous request that used the same idempotency key (status ${status}).',
  RATE_LIMITED:
    'Too many requests hit the Stripe API too quickly (status ${status}).',
  CARD_ERROR:
    'The card was declined or otherwise failed to process (status ${status}): ${vendorMessage}',
  INVALID_REQUEST_ERROR:
    'The request was invalid (status ${status}): ${vendorMessage}',

  // Vendor-documented `error.code` values (https://docs.stripe.com/error-codes).
  CARD_DECLINED: 'The card was declined: ${vendorMessage}',
  PARAMETER_MISSING: 'A required parameter is missing: ${vendorMessage}',
  PARAMETER_INVALID_EMPTY: 'A required parameter was empty: ${vendorMessage}',
  EXPIRED_CARD: 'The card has expired.',
  INCORRECT_CVC: "The card's security code (CVC) is incorrect.",
  INCORRECT_NUMBER: 'The card number is incorrect.',
  PROCESSING_ERROR: 'An error occurred while processing the card.',
  API_KEY_EXPIRED: 'The API key used to make this request has expired.',
  AUTHENTICATION_REQUIRED:
    'The payment requires additional authentication (e.g. 3D Secure) to proceed.',
} as const;

/** Valid Stripe error code. */
export type StripeErrorCode = keyof typeof StripeErrorCodes;
