/**
 * URLhaus error-code to message-template map.
 *
 * URLhaus reports most outcomes in a `query_status` field rather than the
 * HTTP status. `ok` and `no_results` are answers (see `URLhaus`'s lookup
 * methods); the rest map onto the codes below. No message template
 * interpolates a URL, a request body or the Auth-Key.
 */
export const URLhausErrorCodes = {
  // Placeholder-free, like every other connect's UNKNOWN_ERROR.
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with URLhaus.',
  CONFIG_INVALID_AUTH:
    "URLhaus needs `auth: { type: 'CUSTOM', authKey }` — a free Auth-Key from https://auth.abuse.ch/.",
  REQUEST_VALIDATION_ERROR: 'The URLhaus request is invalid: ${reason}',
  INVALID_URL: 'URLhaus refused the URL as invalid (`invalid_url`).',
  INVALID_HOST: 'URLhaus refused the host as invalid (`invalid_host`).',
  INVALID_HASH: 'URLhaus refused the hash as invalid (`${vendorStatus}`).',
  INVALID_REQUEST:
    'URLhaus rejected the request (HTTP ${status}, `${vendorStatus}`).',
  AUTH_FAILED:
    'URLhaus rejected the Auth-Key (HTTP ${status}, `${vendorStatus}`).',
  FORBIDDEN: 'URLhaus refused the request (HTTP ${status}).',
  RATE_LIMITED: 'URLhaus rate limit exceeded (HTTP ${status}).',
  SERVICE_UNAVAILABLE: 'URLhaus is currently unavailable (HTTP ${status}).',
  TIMEOUT: 'URLhaus did not answer within the ${timeoutSeconds}s deadline.',
  NETWORK_ERROR: 'The request to URLhaus failed before a response.',
  RESPONSE_ERROR: 'URLhaus response did not match the expected schema.',
} as const;

/** Valid URLhaus error code. */
export type URLhausErrorCode = keyof typeof URLhausErrorCodes;

/**
 * The codes that mean "no verdict yet — ask again later", as opposed to a
 * definite answer or a definite misconfiguration: the deadline passed, the
 * network failed, URLhaus returned a 5xx, or it rate-limited the call.
 * {@link URLhausError.transient} is `true` for exactly these.
 */
export const URLHAUS_TRANSIENT_CODES: ReadonlySet<URLhausErrorCode> = new Set<
  URLhausErrorCode
>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
]);
