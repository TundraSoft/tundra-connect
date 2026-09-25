/**
 * PayPal error-code to message-template map.
 *
 * Vendor-documented `details[].issue` values (see PayPal's published
 * OpenAPI spec at
 * https://github.com/paypal/paypal-rest-api-specifications/blob/main/openapi/checkout_orders_v2.json)
 * are mapped where confirmed against that spec's own response examples;
 * every other 422 falls back to the generic `VALIDATION_ERROR` code (with
 * `issue` preserved in context) and every other status falls back to a
 * status-code mapping. Connect-specific codes cover client configuration,
 * the OAuth2 token exchange, local request validation, and response
 * validation.
 */
export const PayPalErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with PayPal.',

  // Configuration errors — thrown synchronously from the constructor or
  // `_processOption`, before any request is attempted. `clientSecret`'s
  // *value* is never interpolated into any of these templates or placed in
  // an error's context — only whether it was supplied.
  CONFIG_MISSING_AUTH:
    'PayPal requires auth: { type: "CUSTOM", clientId, clientSecret, environment }.',
  CONFIG_INVALID_AUTH_TYPE:
    'PayPal auth must be { type: "CUSTOM", clientId, clientSecret, environment }, got ${authType}.',
  CONFIG_INVALID_CLIENT_ID: 'PayPal auth requires a non-empty clientId.',
  CONFIG_INVALID_CLIENT_SECRET:
    'PayPal auth requires a non-empty clientSecret.',
  CONFIG_INVALID_ENVIRONMENT:
    'PayPal auth.environment must be "sandbox" or "live", got ${environment}.',

  // OAuth2 client-credentials token exchange (`POST /v1/oauth2/token`)
  // failures — mirrors GCS's `TOKEN_EXCHANGE_FAILED` code name for the same
  // concept (exchanging a credential for a short-lived access token).
  TOKEN_EXCHANGE_FAILED:
    'Failed to exchange PayPal clientId/clientSecret for an OAuth2 access token.',

  // Local request-shape validation, thrown before any request is sent.
  REQUEST_VALIDATION_ERROR:
    'The request did not match the expected PayPal schema: ${reason}.',
  INVALID_ORDER_ID: 'Invalid PayPal order ID: "${value}".',
  INVALID_CAPTURE_ID: 'Invalid PayPal capture ID: "${value}".',

  // Vendor error envelope (`{ name, message, debug_id, details, links }`),
  // mapped primarily from HTTP status; for a 422, `details[].issue` is
  // consulted first for the values confirmed below.
  INVALID_REQUEST: 'PayPal rejected the request as invalid: ${vendorMessage}.',
  AUTH_FAILED:
    'PayPal authentication failed — the access token is missing, expired, or invalid (status ${status}).',
  FORBIDDEN:
    'The authenticated identity does not have permission to perform this operation.',
  NOT_FOUND: 'The requested PayPal order or capture does not exist.',
  CONFLICT: 'The request conflicts with the current state of the resource.',
  UNSUPPORTED_MEDIA_TYPE: "PayPal rejected the request's content type.",
  RATE_LIMITED: 'PayPal rate limit exceeded; retry with backoff.',
  // 422 issue values confirmed against PayPal's published OpenAPI spec
  // response examples (`checkout_orders_v2.json`).
  PAYER_ACTION_REQUIRED:
    'The payer must return to PayPal to complete an additional action before this transaction can complete (issue PAYER_ACTION_REQUIRED).',
  ACTION_DOES_NOT_MATCH_INTENT:
    "The requested action does not match the order's intent — e.g. calling capture on an AUTHORIZE-intent order (issue ACTION_DOES_NOT_MATCH_INTENT).",
  // Generic 422 fallback for every other documented/undocumented issue —
  // ${issue} and ${vendorMessage} carry the specific vendor detail.
  VALIDATION_ERROR:
    'PayPal rejected the request: ${vendorMessage} (issue: ${issue}).',

  RESPONSE_ERROR: 'PayPal API response did not match the expected schema.',
  SERVICE_UNAVAILABLE:
    'PayPal service is currently unavailable (HTTP ${status}).',
  WEBHOOK_INVALID_HEADERS:
    'The webhook request is missing a required PayPal transmission header: ${reason}',
  WEBHOOK_SIGNATURE_INVALID:
    'PayPal did not confirm this webhook transmission — treat it as forged.',
} as const;

/** Valid PayPal error code. */
export type PayPalErrorCode = keyof typeof PayPalErrorCodes;
