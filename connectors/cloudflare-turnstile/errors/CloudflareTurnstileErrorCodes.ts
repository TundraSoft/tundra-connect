/**
 * CloudflareTurnstile error-code to message-template map.
 *
 * Turnstile's siteverify endpoint reports most outcomes in the body's
 * `error-codes` array on an HTTP 200. A failed *challenge*
 * (`invalid-input-response`, `timeout-or-duplicate`) is an answer about the
 * token and resolves as `success: false` — see `CloudflareTurnstile.verify`.
 * Only a failure of the *call* (a bad secret, a malformed request, a
 * Cloudflare-side error, a transport problem) maps onto the codes below.
 * No message template interpolates the secret key or the token.
 */
export const CloudflareTurnstileErrorCodes = {
  // Placeholder-free, like every other connect's UNKNOWN_ERROR.
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with Cloudflare Turnstile.',
  CONFIG_INVALID_SECRET_KEY:
    "Cloudflare Turnstile needs `auth: { type: 'CUSTOM', secretKey }` — the widget's secret key from the Cloudflare dashboard.",
  REQUEST_VALIDATION_ERROR:
    'The Turnstile siteverify request is invalid: ${reason}',
  INVALID_REQUEST:
    'Cloudflare Turnstile rejected the request (HTTP ${status}, `${vendorCodes}`).',
  AUTH_FAILED:
    'Cloudflare Turnstile rejected the secret key (HTTP ${status}, `${vendorCodes}`).',
  RATE_LIMITED: 'Cloudflare Turnstile rate limit exceeded (HTTP ${status}).',
  SERVICE_UNAVAILABLE:
    'Cloudflare Turnstile is currently unavailable (HTTP ${status}, `${vendorCodes}`).',
  TIMEOUT:
    'Cloudflare Turnstile did not answer within the ${timeoutSeconds}s deadline.',
  NETWORK_ERROR:
    'The request to Cloudflare Turnstile failed before a response.',
  RESPONSE_ERROR:
    'Cloudflare Turnstile response did not match the expected schema.',
} as const;

/** Valid CloudflareTurnstile error code. */
export type CloudflareTurnstileErrorCode =
  keyof typeof CloudflareTurnstileErrorCodes;

/**
 * The codes that mean "no verdict yet — try again", as opposed to a
 * definite answer or a misconfiguration retrying will not fix: the
 * deadline passed, the network failed, Turnstile answered `internal-error`
 * or a 5xx, or it rate-limited the call.
 * {@link CloudflareTurnstileError.transient} is `true` for exactly these.
 */
export const CLOUDFLARE_TURNSTILE_TRANSIENT_CODES: ReadonlySet<
  CloudflareTurnstileErrorCode
> = new Set<CloudflareTurnstileErrorCode>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
]);
