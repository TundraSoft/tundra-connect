/**
 * Typed, cross-runtime client for the [Discord
 * API](https://discord.com/developers/docs/intro), scoped to sending
 * notification messages into a channel — via a channel **webhook** or the
 * **bot** REST API.
 *
 * Typed Discord client: post messages through a webhook or a bot token, and
 * verify Ed25519-signed interaction webhooks.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`DiscordError` and its code registry).
 *
 * @example
 * ```ts
 * import { Discord } from '@tundraconnect/discord';
 *
 * const client = new Discord({
 *   webhookUrl: 'https://discord.com/api/webhooks/123456789012345678/abcDEF...',
 * });
 *
 * // Discord's own default: fire-and-forget, resolves to `undefined`.
 * await client.sendWebhookMessage({ content: 'Deploy succeeded' });
 *
 * // Pass `{ wait: true }` to get the created message back.
 * const message = await client.sendWebhookMessage(
 *   {
 *     content: 'Deploy succeeded',
 *     embeds: [{ title: 'Build #482', color: 0x57f287 }],
 *   },
 *   { wait: true },
 * );
 * console.log(message?.id);
 * ```
 *
 * @module
 */

// Export main client class
export {
  Discord,
  type DiscordBotOptions,
  type DiscordCommonOptions,
  type DiscordInternalOptions,
  type DiscordOptions,
  type DiscordWebhookIdOptions,
  type DiscordWebhookUrlOptions,
  type VerifyWebhookOptions,
  type WebhookHeadersLike,
} from './Discord.ts';

// Export error handling
export * from './errors/mod.ts';

// Export all schema types and objects for advanced usage
export {
  ALLOWED_MENTION_PARSE_TYPES,
  type AllowedMentionsSchema,
  AllowedMentionsSchemaObject,
  type AttachmentSchema,
  AttachmentSchemaObject,
  type ChannelMessageRequestSchema,
  ChannelMessageRequestSchemaObject,
  type DiscordUserSchema,
  DiscordUserSchemaObject,
  EMBED_AUTHOR_NAME_MAX_LENGTH,
  EMBED_DESCRIPTION_MAX_LENGTH,
  EMBED_FIELD_NAME_MAX_LENGTH,
  EMBED_FIELD_VALUE_MAX_LENGTH,
  EMBED_FOOTER_TEXT_MAX_LENGTH,
  EMBED_MAX_COLOR,
  EMBED_MAX_FIELDS,
  EMBED_TITLE_MAX_LENGTH,
  EMBED_TOTAL_CHARACTER_LIMIT,
  type EmbedAuthorSchema,
  EmbedAuthorSchemaObject,
  type EmbedFieldSchema,
  EmbedFieldSchemaObject,
  type EmbedFooterSchema,
  EmbedFooterSchemaObject,
  type EmbedMediaSchema,
  EmbedMediaSchemaObject,
  type EmbedSchema,
  EmbedSchemaObject,
  embedsWithinCharacterBudget,
  type ErrorSchema,
  ErrorSchemaObject,
  type MessageSchema,
  MessageSchemaObject,
  parseWebhookUrl,
  type RateLimitSchema,
  RateLimitSchemaObject,
  SNOWFLAKE_PATTERN,
  snowflakeGuard,
  type SnowflakeSchema,
  WEBHOOK_URL_PATTERN,
  type WebhookMessageRequestSchema,
  WebhookMessageRequestSchemaObject,
  webhookUrlGuard,
} from './schema/mod.ts';
