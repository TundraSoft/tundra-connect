/**
 * GoogleWebRisk error-code to message-template map.
 *
 * Vendor failures are classified from Google's standard API error envelope
 * (`{ error: { code, message, status, details } }`) — see
 * `GoogleWebRisk.__toError`. No message template interpolates a URL, a
 * query string or a credential.
 */
export const GoogleWebRiskErrorCodes = {
  // Placeholder-free, like every other connect's UNKNOWN_ERROR.
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with Google Web Risk.',
  CONFIG_INVALID_AUTH:
    "Google Web Risk needs `auth: { type: 'CUSTOM', apiKey }` (an API key) or `auth: { type: 'BEARER', token }` (an OAuth access token).",
  REQUEST_VALIDATION_ERROR: 'The Web Risk request is invalid: ${reason}',
  INVALID_REQUEST:
    'Google Web Risk rejected the request as invalid (HTTP ${status}): ${detail}',
  AUTH_FAILED:
    'Google Web Risk rejected the credentials (HTTP ${status}): ${detail}',
  FORBIDDEN:
    'The credentials may not call Web Risk — is the API enabled and billing set up on the project? (HTTP ${status}): ${detail}',
  RATE_LIMITED:
    'Google Web Risk quota or rate limit exceeded (HTTP ${status}): ${detail}',
  SERVICE_UNAVAILABLE:
    'Google Web Risk is currently unavailable (HTTP ${status}): ${detail}',
  TIMEOUT:
    'Google Web Risk did not answer within the ${timeoutSeconds}s deadline.',
  NETWORK_ERROR: 'The request to Google Web Risk failed before a response.',
  RESPONSE_ERROR: 'Google Web Risk response did not match the expected schema.',
} as const;

/** Valid GoogleWebRisk error code. */
export type GoogleWebRiskErrorCode = keyof typeof GoogleWebRiskErrorCodes;

/**
 * The codes that mean "no verdict yet — ask again later", as opposed to a
 * definite answer or a definite misconfiguration: the deadline passed, the
 * network failed, Google returned a 5xx, or the quota/rate limit was hit.
 * {@link GoogleWebRiskError.transient} is `true` for exactly these.
 */
export const GOOGLE_WEB_RISK_TRANSIENT_CODES: ReadonlySet<
  GoogleWebRiskErrorCode
> = new Set<GoogleWebRiskErrorCode>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
]);
