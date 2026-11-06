/**
 * OpenMeteo error-code to message-template map.
 *
 * Open-Meteo has no machine-readable error codes: a refused request is an
 * HTTP status plus `{ "error": true, "reason": "<free text>" }`. These codes
 * are therefore connect-specific, keyed off the HTTP status (and, for the
 * one refusal the status can't tell apart, the documented API-key reason),
 * plus the client-side configuration and validation codes that never come
 * from the wire.
 */
export const OpenMeteoErrorCodes = {
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with Open-Meteo.',
  CONFIG_INVALID_API_KEY:
    'Open-Meteo API key must be a non-empty string when auth is supplied.',
  CONFIG_INVALID_HOST: 'Open-Meteo host for ${api} must be an https URL.',

  // Connect-specific: local request validation, caught before the call is
  // ever made.
  INVALID_REQUEST: 'Request failed local validation: ${reason}',

  INVALID_API_KEY:
    'Open-Meteo rejected the configured API key (HTTP ${status}).',
  BAD_REQUEST: 'Open-Meteo rejected the request (HTTP ${status}): ${reason}',
  NOT_FOUND: 'Open-Meteo has no such endpoint (HTTP ${status}).',
  RATE_LIMITED: 'Open-Meteo rate limit exceeded (HTTP ${status}).',
  RESPONSE_ERROR: 'Open-Meteo API response did not match the expected schema.',
  SERVICE_UNAVAILABLE:
    'Open-Meteo service is currently unavailable (HTTP ${status}).',
  TIMEOUT:
    'The Open-Meteo API did not answer within the ${timeoutSeconds}s timeout.',
  NETWORK_ERROR:
    'The request to Open-Meteo failed before a response (DNS, TLS or connection failure).',
} as const;

/** Valid OpenMeteo error code. */
export type OpenMeteoErrorCode = keyof typeof OpenMeteoErrorCodes;

/**
 * The codes that mean "no answer yet — try again later", as opposed to a
 * definite refusal or a misconfiguration retrying will not fix: the
 * timeout passed, the network failed, Open-Meteo returned a 5xx, or it
 * rate-limited the call. {@link OpenMeteoError.transient} is `true` for
 * exactly these.
 */
export const OPENMETEO_TRANSIENT_CODES: ReadonlySet<OpenMeteoErrorCode> =
  new Set<OpenMeteoErrorCode>([
    'TIMEOUT',
    'NETWORK_ERROR',
    'RATE_LIMITED',
    'SERVICE_UNAVAILABLE',
  ]);
