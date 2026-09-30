/**
 * Resend error-code to message-template map.
 *
 * The vendor-facing codes group Resend's documented error `name`s
 * (`validation_error`, `restricted_api_key`, `daily_quota_exceeded`, ...)
 * into stable, branchable failure modes — see the mapping table in
 * `Resend.__toError`. The vendor's own `name` always travels in the
 * error's context as `vendorName`.
 */
export const ResendErrorCodes = {
  // Placeholder-free, like every other connect's UNKNOWN_ERROR — the
  // status/detail still travel in the error's context.
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with Resend.',
  CONFIG_INVALID_API_KEY:
    "A Resend API key is required — pass `auth: { type: 'BEARER', token: 're_...' }`.",
  REQUEST_VALIDATION_ERROR: 'The Resend request is invalid: ${reason}',
  RESPONSE_ERROR: 'Resend API response did not match the expected schema.',
  INVALID_REQUEST:
    'Resend rejected the request as invalid (HTTP ${status}): ${detail}',
  AUTH_FAILED: 'Resend rejected the API key (HTTP ${status}): ${detail}',
  FORBIDDEN:
    'The API key is not allowed to perform this request (HTTP ${status}): ${detail}',
  NOT_FOUND: 'Resend could not find the resource (HTTP ${status}): ${detail}',
  IDEMPOTENCY_CONFLICT:
    'The idempotency key is in use by another request or was used with a different body (HTTP ${status}): ${detail}',
  CONFLICT:
    'Another request is already updating this resource (HTTP ${status}): ${detail}',
  QUOTA_EXCEEDED:
    'The Resend daily or monthly sending quota is exhausted (HTTP ${status}): ${detail}',
  RATE_LIMITED: 'Resend rate limit exceeded (HTTP ${status}): ${detail}',
  SERVICE_UNAVAILABLE:
    'Resend is currently unavailable (HTTP ${status}): ${detail}',
  WEBHOOK_INVALID_HEADERS:
    'The webhook request is missing its signature headers: ${reason}',
  WEBHOOK_TIMESTAMP_INVALID:
    'The webhook timestamp is invalid or outside the tolerance window: ${reason}',
  WEBHOOK_SIGNATURE_INVALID:
    'The webhook signature does not match the payload and signing secret.',
  WEBHOOK_INVALID_SECRET:
    'The webhook signing secret is not a valid `whsec_` base64 secret.',
  WEBHOOK_INVALID_PAYLOAD:
    'The verified webhook payload is not a valid Resend event: ${reason}',
} as const;

/** Valid Resend error code. */
export type ResendErrorCode = keyof typeof ResendErrorCodes;
