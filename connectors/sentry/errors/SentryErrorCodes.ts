/**
 * Sentry error-code to message-template map.
 *
 * Sentry's documented error envelope (`{ detail, causes? }`, see
 * {@link ErrorSchemaObject} in `../schema/Error.ts`) carries no
 * machine-readable error code — only free-text `detail`. These codes are
 * therefore connect-specific, keyed off the HTTP status the vendor actually
 * returned (https://docs.sentry.io/api/), plus configuration and local
 * request-validation failures that never come from the wire.
 */
export const SentryErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with Sentry.',

  // Connect-specific: configuration failures, caught at construction.
  CONFIG_INVALID_ORGANIZATION:
    "Sentry 'organization' must be a non-empty slug (letters, digits, '-', '_').",
  CONFIG_INVALID_TOKEN:
    'Sentry `auth` must be `{ type: "BEARER", token }` with a non-empty token.',

  // Local request validation (before a request is sent) and Sentry's
  // documented 400 both use this one code — see CONVENTIONS.md's "Errors"
  // section: the code registry is the extension point, not the class
  // hierarchy, and this connect doesn't need a second code to distinguish
  // "we rejected it" from "Sentry rejected it".
  INVALID_REQUEST:
    'Sentry rejected the request as invalid (HTTP ${status}): ${detail}',

  // HTTP-status-mapped, vendor-documented (https://docs.sentry.io/api/).
  AUTH_FAILED:
    'Sentry rejected the request as unauthenticated (HTTP ${status}): ${detail}',
  FORBIDDEN:
    'Sentry rejected the request as forbidden (HTTP ${status}): ${detail}',
  NOT_FOUND:
    'The requested Sentry resource was not found (HTTP ${status}): ${detail}',
  RATE_LIMITED:
    'Sentry rate limit exceeded (HTTP 429); window resets at ${rateLimitReset}.',
  SERVICE_UNAVAILABLE:
    'Sentry service is currently unavailable (HTTP ${status}).',

  // Fallback for a success-status response whose body fails schema
  // validation.
  RESPONSE_ERROR: 'Sentry API response did not match the expected schema.',
  TIMEOUT:
    'The Sentry API did not answer within the ${timeoutSeconds}s timeout.',
  NETWORK_ERROR:
    'The request to the Sentry API failed before a response (DNS, TLS or connection failure).',
} as const;

/** Valid Sentry error code. */
export type SentryErrorCode = keyof typeof SentryErrorCodes;

/**
 * The codes that mean "no answer yet — try again later", as opposed to a
 * definite refusal or a misconfiguration retrying will not fix: the
 * timeout passed, the network failed, Sentry returned a 5xx, or it
 * rate-limited the call. {@link SentryError.transient} is `true` for
 * exactly these.
 */
export const SENTRY_TRANSIENT_CODES: ReadonlySet<SentryErrorCode> = new Set<
  SentryErrorCode
>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
]);
