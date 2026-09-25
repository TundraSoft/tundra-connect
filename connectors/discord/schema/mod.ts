/**
 * Guardian schemas behind `@tundraconnect/discord`: every request and response
 * shape the client validates, each exported as a schema object with its
 * inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { MessageSchemaObject } from '@tundraconnect/discord/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = MessageSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export {
  ALLOWED_MENTION_PARSE_TYPES,
  type AllowedMentionsSchema,
  AllowedMentionsSchemaObject,
  parseWebhookUrl,
  SNOWFLAKE_PATTERN,
  snowflakeGuard,
  type SnowflakeSchema,
  WEBHOOK_TOKEN_PATTERN,
  WEBHOOK_URL_PATTERN,
  webhookTokenGuard,
  webhookUrlGuard,
} from './Common.ts';

export {
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
} from './Embed.ts';

export {
  type AttachmentSchema,
  AttachmentSchemaObject,
  type DiscordUserSchema,
  DiscordUserSchemaObject,
  type MessageSchema,
  MessageSchemaObject,
} from './Message.ts';

export {
  type ErrorSchema,
  ErrorSchemaObject,
  type RateLimitSchema,
  RateLimitSchemaObject,
} from './Error.ts';

export {
  type WebhookMessageRequestSchema,
  WebhookMessageRequestSchemaObject,
} from './WebhookMessageRequest.ts';

export {
  type ChannelMessageRequestSchema,
  ChannelMessageRequestSchemaObject,
} from './ChannelMessageRequest.ts';
