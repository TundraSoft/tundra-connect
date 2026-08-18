/**
 * Slack error-code to message-template map.
 *
 * Slack's Web API does not use HTTP status codes to signal most failures —
 * it returns `200 OK` with `{ ok: false, error: '<short_error_code>' }` for
 * almost every documented failure (see `../schema/Error.ts` and
 * `Slack.ts`'s `__toError`). The codes below are grouped by where they
 * come from:
 *
 * - Connect-specific codes (configuration, local request validation,
 *   response-schema validation) that never come from the wire.
 * - A stable connect-specific mapping of Slack's own documented `error`
 *   strings (https://docs.slack.dev/reference/scopes-and-permissions —
 *   individual method pages document each method's own error strings),
 *   grouped by what the failure actually means rather than kept 1:1 with
 *   Slack's dozens of specific strings — the raw string survives on the
 *   thrown error's `vendorError` context regardless.
 * - Fallbacks for a genuine HTTP-level failure (`429` with `Retry-After`,
 *   or a `5xx` outage) that bypasses Slack's own JSON envelope entirely.
 */
export const SlackErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with Slack.',

  // Connect-specific: configuration failures, caught at construction.
  CONFIG_INVALID_TOKEN: 'Slack bot token must be a non-empty string.',

  // Connect-specific: local request validation and response-schema
  // validation, caught before/after the call.
  INVALID_REQUEST: 'Slack rejected the request as invalid: ${reason}',
  RESPONSE_ERROR: 'Slack API response did not match the expected schema.',

  // Slack's `{ ok: false, error }` envelope, mapped from its documented
  // error strings (see VENDOR_ERROR_CODE_MAP in Slack.ts). The raw string
  // is always attached as `vendorError` on the thrown error's context.
  AUTH_FAILED:
    "Slack rejected the request as unauthenticated (vendor error '${vendorError}').",
  FORBIDDEN:
    "The configured token is not permitted to perform this request (vendor error '${vendorError}').",
  NOT_FOUND:
    "The requested Slack resource was not found (vendor error '${vendorError}').",
  NOT_IN_CHANNEL:
    "The bot is not a member of the target channel (vendor error '${vendorError}') — invite the bot to the channel first.",

  // Rate limiting: a genuine HTTP 429 (with a `Retry-After` header) and an
  // `ok: false` `error: 'ratelimited'`/`'rate_limited'` both map here.
  RATE_LIMITED: 'Slack rate limit exceeded; retry after ${retryAfter}s.',

  // Genuine HTTP-level failures that bypass Slack's `{ ok, error }`
  // envelope entirely.
  SERVICE_UNAVAILABLE:
    'Slack service is currently unavailable (HTTP ${status}).',
} as const;

/** Valid Slack error code. */
export type SlackErrorCode = keyof typeof SlackErrorCodes;
