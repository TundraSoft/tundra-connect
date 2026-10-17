/**
 * GoogleCertificateManager error-code to message-template map.
 *
 * Vendor failures are classified from Google's standard API error envelope
 * (`{ error: { code, message, status, details } }`), keyed on the canonical
 * `status` name first and the HTTP status second — see
 * `GoogleCertificateManager.__toError`. A failed long-running operation's
 * numeric `google.rpc.Code` maps onto the same codes, so a caller handles
 * `ALREADY_EXISTS` identically whether the create call or its operation
 * reported it. No message template interpolates a credential.
 */
export const GoogleCertificateManagerErrorCodes = {
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with Google Certificate Manager.',

  // Configuration — thrown synchronously from the constructor.
  CONFIG_INVALID_AUTH:
    "Google Certificate Manager needs `auth: { type: 'CUSTOM', clientEmail, privateKey }` (a service account) or `auth: { type: 'BEARER', token }` (an access token), got type ${authType}.",
  CONFIG_INVALID_SERVICE_ACCOUNT:
    'Service-account auth requires a non-empty ${field}.',
  CONFIG_INVALID_PROJECT:
    'Invalid ${field}: "${value}" — expected a Google Cloud project id or number (or a location name for `location`).',

  // Service-account JWT signing / token exchange.
  JWT_SIGNING_FAILED:
    'Failed to sign the service-account JWT for ${clientEmail} — check that privateKey is a valid PKCS8 PEM RSA private key.',
  TOKEN_EXCHANGE_FAILED:
    'Google refused to exchange the signed JWT for an access token (HTTP ${status}).',

  // Local request validation — thrown before any request is sent.
  REQUEST_VALIDATION_ERROR:
    'The Certificate Manager request is invalid: ${reason}',

  // Vendor errors.
  INVALID_REQUEST:
    'Certificate Manager rejected the request as invalid (HTTP ${status}): ${detail}',
  FAILED_PRECONDITION:
    'Certificate Manager refused the request in the resource’s current state (HTTP ${status}): ${detail}',
  AUTH_FAILED:
    'Certificate Manager rejected the credentials (HTTP ${status}): ${detail}',
  PERMISSION_DENIED:
    'The credentials may not perform this Certificate Manager call — check the IAM role and that the API is enabled (HTTP ${status}): ${detail}',
  NOT_FOUND: 'The Certificate Manager resource does not exist: ${detail}',
  ALREADY_EXISTS: 'The Certificate Manager resource already exists: ${detail}',
  CONFLICT:
    'The request conflicted with a concurrent change; retry it (HTTP ${status}): ${detail}',
  RATE_LIMITED:
    'Certificate Manager rate limit exceeded; retry with backoff (HTTP ${status}): ${detail}',
  QUOTA_EXCEEDED:
    'A Certificate Manager resource quota is exhausted — delete resources or raise the quota (HTTP ${status}): ${detail}',
  SERVICE_UNAVAILABLE:
    'Certificate Manager is currently unavailable (HTTP ${status}): ${detail}',
  TIMEOUT:
    'Google did not answer within the ${timeoutSeconds}s request timeout.',
  NETWORK_ERROR:
    'The request to Google failed before a response (DNS, TLS or connection failure).',

  // Long-running operations.
  OPERATION_TIMEOUT:
    'Operation ${operation} was still running after ${timeoutSeconds}s; poll it again later.',

  RESPONSE_ERROR:
    'Certificate Manager response did not match the expected schema.',
} as const;

/** Valid GoogleCertificateManager error code. */
export type GoogleCertificateManagerErrorCode =
  keyof typeof GoogleCertificateManagerErrorCodes;

/**
 * The codes that mean "no answer yet — try again later", as opposed to a
 * definite refusal or a misconfiguration that retrying will not fix: the
 * request timed out or the network failed, Google returned a 5xx or
 * rate-limited the call, a concurrent change aborted it (`CONFLICT`), or an
 * operation was still running at the caller's deadline
 * (`OPERATION_TIMEOUT`). `QUOTA_EXCEEDED` is deliberately absent: a
 * resource-count quota only clears after deletes or a quota increase.
 * {@link GoogleCertificateManagerError.transient} is `true` for exactly
 * these.
 */
export const GOOGLE_CERTIFICATE_MANAGER_TRANSIENT_CODES: ReadonlySet<
  GoogleCertificateManagerErrorCode
> = new Set<GoogleCertificateManagerErrorCode>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
  'CONFLICT',
  'OPERATION_TIMEOUT',
]);
