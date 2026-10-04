/**
 * OpenWeatherMap error-code to message-template map.
 *
 * OpenWeatherMap does not publish discrete machine-readable error codes —
 * its API only returns a free-text `message` alongside an echoed `cod`
 * (itself inconsistently typed as a number on some endpoints and a numeric
 * string on others, see {@link codGuard} in `../schema/Common.ts`). These
 * codes are therefore connect-specific, keyed off the HTTP status the
 * vendor actually returned, plus a couple of client-side
 * configuration/response-validation codes that never come from the wire.
 */
export const OpenWeatherMapErrorCodes = {
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with OpenWeatherMap.',
  CONFIG_INVALID_API_KEY: 'OpenWeatherMap API key must be a non-empty string.',

  // Connect-specific: local request validation, caught before the call is
  // ever made.
  INVALID_REQUEST: 'Request failed local validation: ${reason}',

  INVALID_API_KEY:
    'OpenWeatherMap rejected the configured API key (HTTP ${status}).',
  LOCATION_NOT_FOUND:
    'The requested location could not be found (HTTP ${status}).',
  RATE_LIMITED: 'OpenWeatherMap rate limit exceeded (HTTP ${status}).',
  BAD_REQUEST:
    'OpenWeatherMap rejected the request as invalid (HTTP ${status}).',
  RESPONSE_ERROR:
    'OpenWeatherMap API response did not match the expected schema.',
  SERVICE_UNAVAILABLE:
    'OpenWeatherMap service is currently unavailable (HTTP ${status}).',
  TIMEOUT:
    'The OpenWeatherMap API did not answer within the ${timeoutSeconds}s timeout.',
  NETWORK_ERROR:
    'The request to OpenWeatherMap failed before a response (DNS, TLS or connection failure).',
} as const;

/** Valid OpenWeatherMap error code. */
export type OpenWeatherMapErrorCode = keyof typeof OpenWeatherMapErrorCodes;

/**
 * The codes that mean "no answer yet — try again later", as opposed to a
 * definite refusal or a misconfiguration retrying will not fix: the
 * timeout passed, the network failed, OpenWeatherMap returned a 5xx, or it
 * rate-limited the call. {@link OpenWeatherMapError.transient} is `true` for
 * exactly these.
 */
export const OPENWEATHERMAP_TRANSIENT_CODES: ReadonlySet<
  OpenWeatherMapErrorCode
> = new Set<
  OpenWeatherMapErrorCode
>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
]);
