import { type BaseGuardian, Guardian } from '@guardian';
import { chatIdGuard, type ChatIdSchema } from './Common.ts';

/**
 * Schema for Telegram's `LinkPreviewOptions`, the request-side options
 * for the preview Telegram generates for a URL in a message.
 *
 * Request schemas in this package are `.strict()`: an unknown key is
 * rejected locally rather than silently dropped, so a typo such as
 * `is_disable` fails before the request is sent.
 *
 * @example
 * ```typescript
 * import { LinkPreviewOptionsSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, options] = LinkPreviewOptionsSchemaObject.safeParse({
 *   is_disabled: true,
 * });
 * if (!error) {
 *   console.log(options.is_disabled);
 * }
 * ```
 */
export type LinkPreviewOptionsSchema = {
  /** Disable the link preview. */
  is_disabled?: boolean;
  /** URL to preview; defaults to the first URL in the message text. */
  url?: string;
  /** Shrink the preview media; ignored unless `url` is set. */
  prefer_small_media?: boolean;
  /** Enlarge the preview media; ignored unless `url` is set. */
  prefer_large_media?: boolean;
  /** Show the preview above the message text instead of below it. */
  show_above_text?: boolean;
};

/** Link preview options for a sent or edited message. */
export const LinkPreviewOptionsSchemaObject: BaseGuardian<
  LinkPreviewOptionsSchema
> = Guardian.object({
  is_disabled: Guardian.boolean().strict().optional(),
  url: Guardian.string().minLength(1).optional(),
  prefer_small_media: Guardian.boolean().strict().optional(),
  prefer_large_media: Guardian.boolean().strict().optional(),
  show_above_text: Guardian.boolean().strict().optional(),
}).strict().describe({
  title: 'Link preview options',
  description: 'Link preview options for a sent or edited message.',
});

/**
 * Schema for Telegram's `ReplyParameters`, which describes the message a
 * new message replies to.
 *
 * `message_id` is required unless `ephemeral_message_id` is given; that
 * rule is checked locally. `quote` is 0-1024 characters after entity
 * parsing; the local check counts the raw string's UTF-16 code units,
 * which is never fewer than Telegram counts.
 *
 * @example
 * ```typescript
 * import { ReplyParametersSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, reply] = ReplyParametersSchemaObject.safeParse({
 *   message_id: 42,
 *   allow_sending_without_reply: true,
 * });
 * if (!error) {
 *   console.log(reply.message_id);
 * }
 * ```
 */
export type ReplyParametersSchema = {
  /** Message to reply to, in the current chat or in `chat_id`. */
  message_id?: number;
  /** Chat of the message to reply to, when it is in a different chat. */
  chat_id?: ChatIdSchema;
  /** Ephemeral message to reply to; required when `message_id` is absent. */
  ephemeral_message_id?: number;
  /** Send the message even if the message to reply to is not found. */
  allow_sending_without_reply?: boolean;
  /** Exact substring of the replied-to message to quote; 0-1024 characters. */
  quote?: string;
  /** Formatting mode for `quote`. */
  quote_parse_mode?: string;
  /** Pre-parsed entities in `quote`; instead of `quote_parse_mode`. */
  quote_entities?: unknown[];
  /** Position of the quote in the original message, in UTF-16 code units. */
  quote_position?: number;
  /** Checklist task to reply to. */
  checklist_task_id?: number;
  /** Persistent identifier of the poll option to reply to. */
  poll_option_id?: string;
};

/** Describes the message a new message replies to. */
export const ReplyParametersSchemaObject: BaseGuardian<ReplyParametersSchema> =
  Guardian.object({
    message_id: Guardian.number().integer().strict().optional(),
    chat_id: chatIdGuard.optional(),
    ephemeral_message_id: Guardian.number().integer().strict().optional(),
    allow_sending_without_reply: Guardian.boolean().strict().optional(),
    quote: Guardian.string().maxLength(1024).optional(),
    quote_parse_mode: Guardian.string().optional(),
    quote_entities: Guardian.array(Guardian.unknown()).optional(),
    quote_position: Guardian.number().integer().min(0).strict().optional(),
    checklist_task_id: Guardian.number().integer().strict().optional(),
    poll_option_id: Guardian.string().optional(),
  }).strict().refine(
    (reply) =>
      reply.message_id !== undefined ||
      reply.ephemeral_message_id !== undefined,
    'reply_parameters needs message_id (or ephemeral_message_id)',
  ).describe({
    title: 'Reply parameters',
    description: 'Describes the message a new message replies to.',
  }) as unknown as BaseGuardian<ReplyParametersSchema>;
