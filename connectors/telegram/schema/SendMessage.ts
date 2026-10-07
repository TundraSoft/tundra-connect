import { type BaseGuardian, Guardian } from '@guardian';
import { chatIdGuard, type ChatIdSchema } from './Common.ts';
import { type ReplyMarkupSchema, ReplyMarkupSchemaObject } from './Keyboard.ts';
import {
  type LinkPreviewOptionsSchema,
  LinkPreviewOptionsSchemaObject,
  type ReplyParametersSchema,
  ReplyParametersSchemaObject,
} from './MessageOptions.ts';

/**
 * Documented `parse_mode` values for formatting `text`.
 *
 * `MarkdownV2` and `HTML` are the current formatting modes; `Markdown` is
 * Telegram's legacy mode, kept only for backward compatibility with
 * existing integrations — new code should prefer `MarkdownV2`.
 */
export const PARSE_MODES = ['MarkdownV2', 'HTML', 'Markdown'] as const;

/**
 * Maximum message text length: 4096 characters, which Telegram counts in
 * UTF-16 code units AFTER entity parsing (so `<b>hi</b>` with
 * `parse_mode: 'HTML'` counts as 2).
 *
 * The local check runs before parsing and counts the raw string's UTF-16
 * code units (`text.length`). Without `parse_mode` the two counts agree.
 * With `parse_mode`, the markup itself counts locally, so the local check
 * is stricter than Telegram's: text whose markup pushes it past 4096 is
 * refused here even if the visible text would fit. Split long formatted
 * messages well below the limit.
 */
export const MESSAGE_TEXT_MAX_LENGTH = 4096;

/**
 * Request schema for `POST /sendMessage`.
 *
 * The schema is `.strict()`: an unknown key is rejected locally instead of
 * being silently dropped. `reply_markup`, `reply_parameters` and
 * `link_preview_options` are validated against their own schemas (see
 * {@link ReplyMarkupSchemaObject}, {@link ReplyParametersSchemaObject},
 * {@link LinkPreviewOptionsSchemaObject}). `entities`,
 * `suggested_post_parameters` and `ephemeral_message_parameters` are
 * passed through as-is; Telegram validates them.
 *
 * `entities` is an alternative to `parse_mode` for pre-parsed formatting,
 * and the two are mutually exclusive per Telegram's docs, but that rule is
 * not enforced locally: Telegram rejects a request combining both with a
 * `400 Bad Request`. `disable_web_page_preview` is Telegram's legacy
 * switch, replaced by `link_preview_options: { is_disabled: true }`;
 * setting both is refused locally.
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived): JSR's
 * public-API "slow types" check requires the *originating* declaration of
 * any type reachable from the public API to carry an explicit annotation,
 * including a private, unexported `const` reached only via `typeof` — so
 * the shape is pinned directly here instead of threaded through an
 * internal helper (mirrors `stripe/schema/PaymentIntent.ts`).
 *
 * @example
 * ```typescript
 * import { SendMessageRequestSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, request] = SendMessageRequestSchemaObject.safeParse({
 *   chat_id: '@examplechannel',
 *   text: 'Deployment finished successfully.',
 * });
 * if (!error) {
 *   console.log(request.text);
 * }
 * ```
 */
export type SendMessageRequestSchema = {
  /** Target chat: an integer chat id, or `@username` for a public channel/supergroup. */
  chat_id: ChatIdSchema;
  /**
   * Message text, 1-4096 characters (see {@link MESSAGE_TEXT_MAX_LENGTH}
   * for how the local check counts them).
   */
  text: string;
  /** Formatting mode applied to `text`. Mutually exclusive with `entities`. */
  parse_mode?: (typeof PARSE_MODES)[number];
  /** Pre-parsed formatting entities. Mutually exclusive with `parse_mode`. */
  entities?: unknown[];
  /** Link preview behavior for URLs found in `text`. */
  link_preview_options?: LinkPreviewOptionsSchema;
  /**
   * Legacy: disable the link preview. Prefer
   * `link_preview_options: { is_disabled: true }`; don't set both.
   */
  disable_web_page_preview?: boolean;
  /** Unique identifier of the target message thread (topic), for forum supergroups. */
  message_thread_id?: number;
  /** Direct messages topic to send to; required for a channel's direct messages chat. */
  direct_messages_topic_id?: number;
  /** Unique identifier of the business connection to send the message through. */
  business_connection_id?: string;
  /** Unique identifier of the message effect to apply, for private chats. */
  message_effect_id?: string;
  /** Send silently — the message triggers no notification sound on the recipient's client. */
  disable_notification?: boolean;
  /** Protect the message content from forwarding and saving. */
  protect_content?: boolean;
  /** Allow the paid broadcast of the message at a higher-than-default rate, for business accounts with enough Stars. */
  allow_paid_broadcast?: boolean;
  /** Suggested-post parameters, for direct messages chats; passed through as-is. */
  suggested_post_parameters?: Record<string, unknown>;
  /** Ephemeral-message parameters; passed through as-is. */
  ephemeral_message_parameters?: Record<string, unknown>;
  /** Describes the message being replied to. Replaces the deprecated `reply_to_message_id`. */
  reply_parameters?: ReplyParametersSchema;
  /** Inline keyboard, reply keyboard, or reply-removal/force-reply instruction. */
  reply_markup?: ReplyMarkupSchema;
};

/** Request body validated before POST /sendMessage. */
export const SendMessageRequestSchemaObject: BaseGuardian<
  SendMessageRequestSchema
> = Guardian.object({
  chat_id: chatIdGuard,
  text: Guardian.string().minLength(1).maxLength(MESSAGE_TEXT_MAX_LENGTH),
  parse_mode: Guardian.enum(PARSE_MODES).optional(),
  entities: Guardian.array(Guardian.unknown()).optional(),
  link_preview_options: LinkPreviewOptionsSchemaObject.optional(),
  disable_web_page_preview: Guardian.boolean().strict().optional(),
  message_thread_id: Guardian.number().integer().strict().optional(),
  direct_messages_topic_id: Guardian.number().integer().strict().optional(),
  business_connection_id: Guardian.string().optional(),
  message_effect_id: Guardian.string().optional(),
  disable_notification: Guardian.boolean().strict().optional(),
  protect_content: Guardian.boolean().strict().optional(),
  allow_paid_broadcast: Guardian.boolean().strict().optional(),
  suggested_post_parameters: Guardian.object({}).passthrough().optional(),
  ephemeral_message_parameters: Guardian.object({}).passthrough().optional(),
  reply_parameters: ReplyParametersSchemaObject.optional(),
  reply_markup: ReplyMarkupSchemaObject.optional(),
}).strict().refine(
  (request) =>
    request.link_preview_options === undefined ||
    request.disable_web_page_preview === undefined,
  'set link_preview_options or the legacy disable_web_page_preview, not both',
).describe({
  title: 'sendMessage request',
  description: 'Request body validated before POST /sendMessage.',
}) as unknown as BaseGuardian<SendMessageRequestSchema>;
