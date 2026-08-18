/**
 * GCS error-code to message-template map.
 *
 * Vendor-documented `reason` values (see
 * https://cloud.google.com/storage/docs/json_api/v1/status-codes) are
 * preserved where Google Cloud Storage's JSON API documents them;
 * connect-specific codes cover configuration, JWT signing, token exchange,
 * and response validation failures.
 */
export const GCSErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred in the GCS connect.',

  // Configuration errors — thrown synchronously from the constructor or
  // `_processOption` before any request is attempted.
  CONFIG_INVALID_AUTH_TYPE:
    'GCS auth must be { type: "BEARER" } or { type: "CUSTOM" } (service account), got ${authType}.',
  CONFIG_INVALID_SERVICE_ACCOUNT:
    'Service-account auth requires a non-empty ${field}.',

  // Service-account (CUSTOM auth) JWT signing / token exchange failures.
  JWT_SIGNING_FAILED:
    'Failed to sign the service-account JWT for ${clientEmail} — check that privateKey is a valid PKCS8 PEM RSA private key.',
  TOKEN_EXCHANGE_FAILED:
    'Failed to exchange the signed JWT for an OAuth2 access token.',

  // Local request-shape validation — thrown synchronously before any
  // request is built.
  INVALID_BUCKET:
    'Invalid GCS bucket: "${value}" — must not be empty or whitespace-only.',
  INVALID_KEY:
    'Invalid GCS key: "${value}" — must not be empty or whitespace-only.',
  INVALID_OBJECT_KEY:
    'Invalid GCS ${field}: "${value}" — must not contain a "." or ".." path segment.',

  // Vendor error envelope, mapped from `error.errors[0].reason`
  // (https://cloud.google.com/storage/docs/json_api/v1/status-codes).
  INVALID_REQUEST: 'GCS rejected the request as invalid: ${vendorMessage}.',
  AUTH_ERROR:
    'GCS authentication failed — the access token is missing, expired, or invalid.',
  FORBIDDEN:
    'The authenticated identity does not have permission to perform this operation.',
  NOT_FOUND: 'The requested bucket or object does not exist.',
  CONFLICT: 'The request conflicts with the current state of the resource.',
  RATE_LIMIT_EXCEEDED:
    'GCS rate limit exceeded for this project; retry with backoff.',
  BACKEND_ERROR: 'GCS returned an internal/backend error.',

  // Local validation / unexpected-response fallbacks.
  RESPONSE_ERROR: 'GCS API response did not match the expected schema.',
  SERVICE_UNAVAILABLE: 'GCS service is currently unavailable.',
} as const;

/** Valid GCS error code. */
export type GCSErrorCode = keyof typeof GCSErrorCodes;
