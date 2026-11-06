/**
 * EIA error-code to message-template map.
 *
 * api.eia.gov answers a refused request in one of two shapes: the API
 * gateway's `{ "error": { "code": "API_KEY_MISSING", "message": ... } }`
 * (key and rate-limit refusals) or the API's own
 * `{ "error": "<text>", "code": 400 }`. These codes are keyed off the HTTP
 * status, with the gateway's code kept as `vendorCode`.
 */
export const EIAErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with EIA.',
  CONFIG_INVALID_API_KEY: 'EIA API key must be a non-empty string.',

  // Connect-specific: local request validation, caught before the call is
  // ever made.
  INVALID_REQUEST: 'Request failed local validation: ${reason}',

  INVALID_API_KEY: 'EIA rejected the API key (HTTP ${status}, ${vendorCode}).',
  BAD_REQUEST: 'EIA rejected the request (HTTP ${status}): ${reason}',
  NOT_FOUND: 'EIA has no such route (HTTP ${status}): ${reason}',
  RATE_LIMITED: 'EIA rate limit exceeded (HTTP ${status}).',
  RESPONSE_ERROR: 'EIA API response did not match the expected schema.',
  SERVICE_UNAVAILABLE: 'EIA is currently unavailable (HTTP ${status}).',
  TIMEOUT: 'EIA did not answer within the ${timeoutSeconds}s timeout.',
  NETWORK_ERROR:
    'The request to EIA failed before a response (DNS, TLS or connection failure).',
} as const;

/** Valid EIA error code. */
export type EIAErrorCode = keyof typeof EIAErrorCodes;

/**
 * The codes that mean "no answer yet — try again later": the timeout
 * passed, the network failed, EIA returned a 5xx, or it rate-limited the
 * call. {@link EIAError.transient} is `true` for exactly these.
 */
export const EIA_TRANSIENT_CODES: ReadonlySet<EIAErrorCode> = new Set<
  EIAErrorCode
>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
]);
