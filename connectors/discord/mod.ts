/**
 * @module @tundraconnect/discord
 */

// Export main client class
export {
  Discord,
  type DiscordBotOptions,
  type DiscordOptions,
  type DiscordWebhookIdOptions,
  type DiscordWebhookUrlOptions,
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
