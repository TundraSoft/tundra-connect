/**
 * DodoPayments error-code to message-template map.
 *
 * Dodo returns a `{ code, message }` envelope with an HTTP status. The
 * vendor's own `code` is preserved in the error's `vendorCode` context
 * value; the names below are this connect's stable classification, which
 * is what callers should branch on.
 */
export const DodoPaymentsErrorCodes = {
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with Dodo Payments.',
  CONFIG_INVALID_API_KEY:
    "A Dodo Payments API key is required — pass `auth: { type: 'BEARER', token }`.",
  CONFIG_INVALID_MODE: "`mode` must be either 'test' or 'live' (got ${mode}).",
  REQUEST_VALIDATION_ERROR: 'The request is invalid: ${reason}',
  RESPONSE_ERROR:
    'Dodo Payments API response did not match the expected schema.',
  INVALID_REQUEST:
    'Dodo Payments rejected the request as invalid (HTTP ${status}): ${detail}',
  AUTH_FAILED: 'Dodo Payments rejected the API key (HTTP ${status}): ${detail}',
  FORBIDDEN:
    'The API key lacks permission for this operation (HTTP ${status}): ${detail}',
  NOT_FOUND:
    'The requested resource does not exist (HTTP ${status}): ${detail}',
  RATE_LIMITED: 'Dodo Payments rate limit exceeded (HTTP ${status}): ${detail}',
  SERVICE_UNAVAILABLE:
    'Dodo Payments is currently unavailable (HTTP ${status}): ${detail}',
  WEBHOOK_INVALID_HEADERS:
    'The webhook request is missing a required Standard Webhooks header: ${reason}',
  WEBHOOK_TIMESTAMP_INVALID:
    'The webhook timestamp is outside the allowed tolerance: ${reason}',
  WEBHOOK_SIGNATURE_INVALID:
    'The webhook signature does not match — treat this request as forged.',
  WEBHOOK_INVALID_SECRET:
    'The webhook signing secret is not valid base64 (with or without a `whsec_` prefix).',
} as const;

/** Valid DodoPayments error code. */
export type DodoPaymentsErrorCode = keyof typeof DodoPaymentsErrorCodes;
