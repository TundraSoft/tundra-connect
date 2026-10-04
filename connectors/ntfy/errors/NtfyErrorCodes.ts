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
  TIMEOUT: 'ntfy did not answer within the ${timeoutSeconds}s timeout.',
  NETWORK_ERROR:
    'The request to ntfy failed before a response (DNS, TLS or connection failure).',
} as const;

/** Valid ntfy error code. */
export type NtfyErrorCode = keyof typeof NtfyErrorCodes;

/**
 * The codes that mean "no answer yet — try again later", as opposed to a
 * definite refusal or a misconfiguration retrying will not fix: the
 * timeout passed, the network failed, ntfy returned a 5xx, or it
 * rate-limited the call. {@link NtfyError.transient} is `true` for
 * exactly these.
 */
export const NTFY_TRANSIENT_CODES: ReadonlySet<NtfyErrorCode> = new Set<
  NtfyErrorCode
>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
]);
