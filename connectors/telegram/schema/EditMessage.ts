import { type BaseGuardian, Guardian } from '@guardian';
import {
  chatIdGuard,
  type ChatIdSchema,
  type MessageSchema,
  MessageSchemaObject,
  TrueResultSchemaObject,
} from './Common.ts';
import {
  type InlineKeyboardMarkupSchema,
  InlineKeyboardMarkupSchemaObject,
} from './Keyboard.ts';
import {
  type LinkPreviewOptionsSchema,
  LinkPreviewOptionsSchemaObject,
} from './MessageOptions.ts';
import { MESSAGE_TEXT_MAX_LENGTH, PARSE_MODES } from './SendMessage.ts';

/**
 * Which message an edit targets: a message the bot sent to a chat
 * (`chat_id` + `message_id`), or a message sent via the bot in inline mode
 * (`inline_message_id`). Exactly one form must be used; mixing them is
 * refused locally.
 */
export type EditMessageTargetSchema =
  | {
    /** Chat the message is in. */
    chat_id: ChatIdSchema;
    /** The message to edit. */
    message_id: number;
    inline_message_id?: never;
  }
  | {
    /** Identifier of the inline message to edit. */
    inline_message_id: string;
    chat_id?: never;
    message_id?: never;
  };

/** `true` when `request` names exactly one edit target form. */
function hasOneTarget(request: {
  chat_id?: unknown;
  message_id?: unknown;
  inline_message_id?: unknown;
}): boolean {
  const byChat = request.chat_id !== undefined &&
    request.message_id !== undefined;
  const inline = request.inline_message_id !== undefined;
  const partialChat = request.chat_id !== undefined ||
    request.message_id !== undefined;
  return inline ? !partialChat : byChat;
}

const TARGET_MESSAGE =
  'edit either chat_id + message_id, or inline_message_id — exactly one of the two';

/**
 * Request schema for `POST /editMessageText`.
 *
 * `text` follows the same 1-4096 limit and local counting rule as
 * `sendMessage` (see {@link MESSAGE_TEXT_MAX_LENGTH}). Only an inline
 * keyboard can be attached to an edited message. Telegram's newer
 * `rich_message` alternative to `text` is not modeled.
 *
 * @example
 * ```typescript
 * import { EditMessageTextRequestSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, request] = EditMessageTextRequestSchemaObject.safeParse({
 *   chat_id: 123456789,
 *   message_id: 42,
 *   text: 'Resolved by @ada',
 * });
 * if (!error) {
 *   console.log(request.text);
 * }
 * ```
 */
export type EditMessageTextRequestSchema = EditMessageTargetSchema & {
  /** New message text, 1-4096 characters. */
  text: string;
  /** Formatting mode applied to `text`. Mutually exclusive with `entities`. */
  parse_mode?: (typeof PARSE_MODES)[number];
  /** Pre-parsed formatting entities. Mutually exclusive with `parse_mode`. */
  entities?: unknown[];
  /** Link preview behavior for URLs found in `text`. */
  link_preview_options?: LinkPreviewOptionsSchema;
  /** Business connection the message was sent through. */
  business_connection_id?: string;
  /** New inline keyboard; omit to remove the current one. */
  reply_markup?: InlineKeyboardMarkupSchema;
};

/** Request body validated before POST /editMessageText. */
export const EditMessageTextRequestSchemaObject: BaseGuardian<
  EditMessageTextRequestSchema
> = Guardian.object({
  chat_id: chatIdGuard.optional(),
  message_id: Guardian.number().integer().strict().optional(),
  inline_message_id: Guardian.string().minLength(1).optional(),
  text: Guardian.string().minLength(1).maxLength(MESSAGE_TEXT_MAX_LENGTH),
  parse_mode: Guardian.enum(PARSE_MODES).optional(),
  entities: Guardian.array(Guardian.unknown()).optional(),
  link_preview_options: LinkPreviewOptionsSchemaObject.optional(),
  business_connection_id: Guardian.string().optional(),
  reply_markup: InlineKeyboardMarkupSchemaObject.optional(),
}).strict().refine(hasOneTarget, TARGET_MESSAGE).describe({
  title: 'editMessageText request',
  description: 'Request body validated before POST /editMessageText.',
}) as unknown as BaseGuardian<EditMessageTextRequestSchema>;

/**
 * Request schema for `POST /editMessageReplyMarkup` — replace or remove a
 * message's inline keyboard without touching its text.
 *
 * @example
 * ```typescript
 * import { EditMessageReplyMarkupRequestSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * // No reply_markup: removes the keyboard.
 * EditMessageReplyMarkupRequestSchemaObject.parse({
 *   chat_id: 123456789,
 *   message_id: 42,
 * });
 * ```
 */
export type EditMessageReplyMarkupRequestSchema = EditMessageTargetSchema & {
  /** Business connection the message was sent through. */
  business_connection_id?: string;
  /** New inline keyboard; omit to remove the current one. */
  reply_markup?: InlineKeyboardMarkupSchema;
};

/** Request body validated before POST /editMessageReplyMarkup. */
export const EditMessageReplyMarkupRequestSchemaObject: BaseGuardian<
  EditMessageReplyMarkupRequestSchema
> = Guardian.object({
  chat_id: chatIdGuard.optional(),
  message_id: Guardian.number().integer().strict().optional(),
  inline_message_id: Guardian.string().minLength(1).optional(),
  business_connection_id: Guardian.string().optional(),
  reply_markup: InlineKeyboardMarkupSchemaObject.optional(),
}).strict().refine(hasOneTarget, TARGET_MESSAGE).describe({
  title: 'editMessageReplyMarkup request',
  description: 'Request body validated before POST /editMessageReplyMarkup.',
}) as unknown as BaseGuardian<EditMessageReplyMarkupRequestSchema>;

/**
 * What an edit method returns: the edited {@link MessageSchema} for a
 * message the bot sent to a chat, or `true` for an inline message.
 */
export type EditMessageResultSchema = MessageSchema | true;

/**
 * Validates the `result` of `editMessageText` / `editMessageReplyMarkup`.
 *
 * @example
 * ```typescript
 * import { EditMessageResultSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * EditMessageResultSchemaObject.parse(true); // an inline message was edited
 * ```
 */
export const EditMessageResultSchemaObject: BaseGuardian<
  EditMessageResultSchema
> = Guardian.oneOf(
  [TrueResultSchemaObject, MessageSchemaObject],
  'expected the edited Message or true',
).describe({
  title: 'Edit result',
  description: 'The edited Message, or `true` for an inline message.',
});
