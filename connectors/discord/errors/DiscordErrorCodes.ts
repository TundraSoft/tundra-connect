/**
 * Discord error-code to message-template map.
 *
 * Discord publishes a large, stable, numeric JSON error-code space
 * (https://discord.com/developers/docs/topics/opcodes-and-status-codes#json-error-codes).
 * The codes below reuse that numbering (see `VENDOR_ERROR_CODE_MAP` in
 * `../Discord.ts`) for the failures most relevant to sending a message,
 * keyed here under a descriptive name; connect-specific codes cover
 * configuration, local request validation, and response-parsing failures
 * that never come from the wire.
 */
export const DiscordErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with Discord.',

  // Connect-specific: configuration failures, caught at construction.
  CONFIG_MISSING_CREDENTIALS:
    'Configure the client with either a webhook (webhookUrl, or webhookId + webhookToken) or a bot token (botToken).',
  CONFIG_AMBIGUOUS_CREDENTIALS:
    'Configure the client with exactly one of a webhook or a bot token, not both.',
  CONFIG_INCOMPLETE_WEBHOOK:
    'webhookId and webhookToken must be supplied together.',
  CONFIG_INVALID_WEBHOOK_ID:
    'webhookId must be a Discord snowflake ID (a 17-20 digit numeric string).',
  CONFIG_INVALID_WEBHOOK_TOKEN:
    // Deliberately does NOT interpolate the offending token value — it IS
    // the webhook's credential (same reasoning as CONFIG_INVALID_WEBHOOK_URL
    // below).
    "webhookToken must be a single URL path segment: it cannot contain '/', '?', or '#', or be '.' or '..'.",
  CONFIG_INVALID_WEBHOOK_URL:
    // Deliberately does NOT interpolate the offending `webhookUrl` value —
    // the URL's path segment IS the webhook's id+token credential, and
    // `.message` is what commonly ends up in logs/Sentry/uncaught-exception
    // handlers. See `Discord.ts`'s `_processOption` for the call site.
    "webhookUrl must match 'https://discord.com/api[/vN]/webhooks/{webhook.id}/{webhook.token}'.",
  CONFIG_INVALID_BOT_TOKEN: 'Discord bot token must be a non-empty string.',

  // Connect-specific: local request validation, caught before the call.
  REQUEST_VALIDATION_ERROR:
    'The request failed local schema validation and was not sent: ${reason}',
  MODE_MISMATCH:
    "${method}() requires the client to be configured for '${expected}' mode; this client is configured for '${actual}' mode.",

  // Vendor-documented codes
  // (https://discord.com/developers/docs/topics/opcodes-and-status-codes#json-error-codes).
  GENERAL_ERROR:
    'General error reported by Discord (JSON error code 0) — often a malformed request body.',
  UNKNOWN_CHANNEL:
    'Unknown channel (Discord error 10003) — the channel ID does not exist or is not visible to the bot.',
  UNKNOWN_MESSAGE: 'Unknown message (Discord error 10008).',
  UNKNOWN_WEBHOOK:
    'Unknown webhook (Discord error 10015) — the webhook may have been deleted.',
  MISSING_ACCESS:
    'Missing access (Discord error 50001) — the bot cannot see this resource.',
  EMPTY_MESSAGE:
    "Cannot send an empty message (Discord error 50006) — provide 'content' and/or 'embeds'.",
  CANNOT_MESSAGE_USER:
    'Cannot send messages to this user (Discord error 50007).',
  CHANNEL_NOT_TEXT:
    'Cannot send messages in a non-text channel (Discord error 50008).',
  MISSING_PERMISSIONS:
    'The bot lacks permission to perform this action (Discord error 50013).',
  INVALID_AUTH_TOKEN:
    'Invalid authentication token provided (Discord error 50014) — check the configured bot token.',
  INVALID_WEBHOOK_TOKEN:
    'Invalid webhook token provided (Discord error 50027) — the webhook may have been deleted or regenerated.',
  INVALID_FORM_BODY:
    'Invalid form body (Discord error 50035) — the request payload failed Discord-side validation.',
  MAX_ATTACHMENTS:
    'Maximum number of attachments in a message reached (Discord error 30015).',
  FILE_TOO_LARGE:
    'File uploaded exceeds the maximum size (Discord error 50045).',

  // Fallbacks for undocumented / status-only / unparseable responses.
  UNAUTHORIZED:
    'Discord rejected the request as unauthenticated (HTTP ${status}).',
  FORBIDDEN:
    'The configured credential is not permitted to perform this request (HTTP ${status}).',
  NOT_FOUND: 'The requested Discord resource was not found (HTTP ${status}).',
  RATE_LIMITED:
    'Discord rate limit exceeded; retry after ${retryAfter}s (HTTP 429).',
  RESPONSE_ERROR: 'Discord API response failed schema validation.',
  SERVICE_UNAVAILABLE:
    'Discord service is currently unavailable (HTTP ${status}).',
} as const;

/** Valid Discord error code. */
export type DiscordErrorCode = keyof typeof DiscordErrorCodes;
