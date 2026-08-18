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
} as const;

/** Valid OpenWeatherMap error code. */
export type OpenWeatherMapErrorCode = keyof typeof OpenWeatherMapErrorCodes;
