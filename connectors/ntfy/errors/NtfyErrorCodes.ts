/**
 * ntfy error-code to message-template map.
 *
 * ntfy's HTTP error envelope (`{ code, http, error, link? }`, see
 * {@link ErrorSchemaObject} in `../schema/Error.ts`) carries a numeric vendor
 * `code` (e.g. `40101`), but that code is only ever surfaced as diagnostic
 * metadata — these codes are connect-specific, keyed off the HTTP status the
 * vendor actually returned, plus a couple of client-side
 * configuration/response-validation codes that never come from the wire.
 */
export const NtfyErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with ntfy.',
  REQUEST_VALIDATION_ERROR:
    'The request failed local schema validation and was not sent.',
  BAD_REQUEST: 'ntfy rejected the request as invalid (HTTP ${status}).',
  AUTH_REQUIRED:
    'ntfy rejected the request as unauthenticated (HTTP ${status}). The topic may require a username/password or access token.',
  FORBIDDEN:
    'The configured credentials are not permitted to publish to this topic (HTTP ${status}).',
  NOT_FOUND: 'The requested ntfy resource was not found (HTTP ${status}).',
  PAYLOAD_TOO_LARGE:
    "The request exceeded ntfy's size or bandwidth limit (HTTP ${status}).",
  RATE_LIMITED: 'ntfy rate limit exceeded (HTTP ${status}).',
  RESPONSE_ERROR: 'ntfy API response did not match the expected schema.',
  SERVICE_UNAVAILABLE:
    'ntfy service is currently unavailable (HTTP ${status}).',
} as const;

/** Valid ntfy error code. */
export type NtfyErrorCode = keyof typeof NtfyErrorCodes;
