/**
 * CloudflareEmail error-code to message-template map.
 *
 * The vendor-facing codes mirror Cloudflare's own documented numeric error
 * codes for Email Sending one-for-one (see the mapping table in
 * `CloudflareEmail.__toError`), so a caller can branch on a stable name
 * (`err.code === 'ACCOUNT_NOT_ENTITLED'`) instead of on `10105`.
 */
export const CloudflareEmailErrorCodes = {
  // Placeholder-free, like every other connect's UNKNOWN_ERROR — the
  // status/detail still travel in the error's context, they just aren't
  // interpolated into a message that may be rendered with neither.
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with Cloudflare Email Sending.',
  CONFIG_INVALID_ACCOUNT_ID:
    'A non-empty Cloudflare account id is required (`accountId`).',
  CONFIG_INVALID_API_TOKEN:
    "A Cloudflare API token is required — pass `auth: { type: 'BEARER', token }`.",
  REQUEST_VALIDATION_ERROR: 'The send request is invalid: ${reason}',
  RESPONSE_ERROR:
    'Cloudflare Email Sending response did not match the expected schema.',
  INVALID_REQUEST:
    'Cloudflare rejected the request as invalid (HTTP ${status}): ${detail}',
  MESSAGE_TOO_LARGE:
    "The message exceeds Cloudflare's 5 MiB limit, attachments included (HTTP ${status}): ${detail}",
  AUTH_FAILED: 'Cloudflare rejected the API token (HTTP ${status}): ${detail}',
  FORBIDDEN:
    'The API token lacks the Email Sending permission (HTTP ${status}): ${detail}',
  ACCOUNT_NOT_ENTITLED:
    'This account is not entitled to Email Sending — it is a Workers Paid beta feature (HTTP ${status}): ${detail}',
  RATE_LIMITED:
    'Cloudflare Email Sending rate limit exceeded (HTTP ${status}): ${detail}',
  SERVICE_UNAVAILABLE:
    'Cloudflare Email Sending is currently unavailable (HTTP ${status}): ${detail}',
} as const;

/** Valid CloudflareEmail error code. */
export type CloudflareEmailErrorCode = keyof typeof CloudflareEmailErrorCodes;
