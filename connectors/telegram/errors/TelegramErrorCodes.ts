/**
 * Telegram error-code to message-template map.
 *
 * Telegram's `error_code` field simply echoes the HTTP status the Bot API
 * returned (documented as "subject to change in the future", so it is not
 * treated as a stable machine-readable code space) — these codes are
 * therefore connect-specific, keyed off the HTTP status/`error_code`
 * actually returned, plus a couple of client-side configuration/local
 * validation codes that never come from the wire.
 */
export const TelegramErrorCodes = {
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with the Telegram Bot API.',
  CONFIG_INVALID_BOT_TOKEN:
    "Telegram bot token must be a non-empty string matching '<bot id>:<secret>', issued by @BotFather.",
  REQUEST_VALIDATION_ERROR:
    'The request failed local schema validation and was not sent.',
  BAD_REQUEST:
    'Telegram rejected the request as malformed (HTTP ${status}): ${description}',
  AUTH_FAILED:
    'Telegram rejected the configured bot token (HTTP ${status}): ${description}',
  FORBIDDEN:
    'Telegram refused to perform the request (HTTP ${status}): ${description}',
  NOT_FOUND:
    'The requested Telegram chat, message, or resource was not found (HTTP ${status}): ${description}',
  RATE_LIMITED:
    'Telegram rate-limited the request; retry after ${retryAfter} second(s) (HTTP ${status}).',
  RESPONSE_ERROR: 'Telegram API response did not match the expected schema.',
  SERVICE_UNAVAILABLE:
    'The Telegram Bot API is currently unavailable (HTTP ${status}).',
} as const;

/** Valid Telegram error code. */
export type TelegramErrorCode = keyof typeof TelegramErrorCodes;
