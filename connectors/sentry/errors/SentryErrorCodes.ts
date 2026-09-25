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
} as const;

/** Valid Sentry error code. */
export type SentryErrorCode = keyof typeof SentryErrorCodes;
