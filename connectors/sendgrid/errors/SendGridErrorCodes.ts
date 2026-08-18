/**
 * SendGrid error-code to message-template map.
 *
 * SendGrid does not publish discrete machine-readable error codes — its API
 * only returns free-text `message` / `field` pairs on 4xx/5xx responses (see
 * {@link ErrorSchemaObject} in `../schema/Error.ts`). These codes are
 * therefore connect-specific, keyed off the HTTP status the vendor actually
 * returned, plus a couple of client-side configuration/response-validation
 * codes that never come from the wire.
 */
export const SendGridErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with SendGrid.',
  CONFIG_INVALID_API_KEY: 'SendGrid API key must be a non-empty string.',
  REQUEST_VALIDATION_ERROR:
    'The request failed local schema validation and was not sent.',
  AUTH_REQUIRED:
    'SendGrid rejected the request as unauthenticated (HTTP ${status}).',
  VALIDATION_ERROR:
    'SendGrid rejected the request as invalid (HTTP ${status}).',
  FORBIDDEN:
    'The configured API key is not permitted to perform this request (HTTP ${status}).',
  NOT_FOUND: 'The requested SendGrid resource was not found (HTTP ${status}).',
  METHOD_NOT_ALLOWED:
    'The HTTP method is not allowed for this SendGrid endpoint (HTTP ${status}).',
  PAYLOAD_TOO_LARGE:
    "The request payload exceeded SendGrid's size limit (HTTP ${status}).",
  RATE_LIMITED: 'SendGrid rate limit exceeded (HTTP ${status}).',
  RESPONSE_ERROR: 'SendGrid API response did not match the expected schema.',
  SERVICE_UNAVAILABLE:
    'SendGrid service is currently unavailable (HTTP ${status}).',
} as const;

/** Valid SendGrid error code. */
export type SendGridErrorCode = keyof typeof SendGridErrorCodes;
