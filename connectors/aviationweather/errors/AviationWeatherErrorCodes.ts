/**
 * AviationWeather error-code to message-template map.
 *
 * aviationweather.gov answers a refused request with an HTTP status and
 * `{ "status": "error", "error": "<free text>" }` (see its Data API
 * "Responses" table). These codes are keyed off that status, plus the
 * client-side codes that never come from the wire.
 */
export const AviationWeatherErrorCodes = {
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with aviationweather.gov.',
  CONFIG_INVALID_RATE_LIMIT:
    'rateLimit must be false or { requests, windowMs } with positive integers.',

  // Connect-specific: local request validation, caught before the call is
  // ever made.
  INVALID_REQUEST: 'Request failed local validation: ${reason}',

  BAD_REQUEST:
    'aviationweather.gov rejected the request (HTTP ${status}): ${reason}',
  FORBIDDEN:
    'aviationweather.gov refused the request (HTTP ${status}): the endpoint is restricted or the client is blocked.',
  NOT_FOUND: 'aviationweather.gov has no such resource (HTTP ${status}).',
  RATE_LIMITED:
    'aviationweather.gov rate limit exceeded (HTTP ${status}); it allows 100 requests per minute.',
  RESPONSE_ERROR:
    'aviationweather.gov response did not match the expected schema.',
  SERVICE_UNAVAILABLE:
    'aviationweather.gov is currently unavailable (HTTP ${status}).',
  TIMEOUT:
    'aviationweather.gov did not answer within the ${timeoutSeconds}s timeout.',
  NETWORK_ERROR:
    'The request to aviationweather.gov failed before a response (DNS, TLS or connection failure).',
} as const;

/** Valid AviationWeather error code. */
export type AviationWeatherErrorCode = keyof typeof AviationWeatherErrorCodes;

/**
 * The codes that mean "no answer yet — try again later": the timeout
 * passed, the network failed, the service returned a 5xx, or it
 * rate-limited the call. {@link AviationWeatherError.transient} is `true`
 * for exactly these.
 */
export const AVIATIONWEATHER_TRANSIENT_CODES: ReadonlySet<
  AviationWeatherErrorCode
> = new Set<AviationWeatherErrorCode>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
]);
