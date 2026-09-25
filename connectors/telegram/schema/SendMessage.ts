import { type BaseGuardian, Guardian } from '@guardian';
import { chatIdGuard, type ChatIdSchema } from './Common.ts';

/**
 * Documented `parse_mode` values for formatting `text`.
 *
 * `MarkdownV2` and `HTML` are the current formatting modes; `Markdown` is
 * Telegram's legacy mode, kept only for backward compatibility with
 * existing integrations — new code should prefer `MarkdownV2`.
 */
export const PARSE_MODES = ['MarkdownV2', 'HTML', 'Markdown'] as const;

/**
 * Request schema for `POST /sendMessage`.
 *
 * `reply_markup`, `reply_parameters`, and `link_preview_options` are
 * modeled loosely (`Guardian.object().passthrough()`) — Telegram's
 * inline/reply-keyboard and reply/link-preview shapes are large,
 * independently-versioned structures that this connect passes through
 * as-is rather than fully re-modeling; Telegram itself validates them.
 * `entities` is similarly a passthrough array — it is an alternative to
 * `parse_mode` for pre-parsed formatting, and the two are mutually
 * exclusive per Telegram's docs, but that cross-field rule is not
 * enforced locally: Telegram rejects a request combining both with a
 * documented `400 Bad Request`.
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
  /** Message text (1-4096 characters). */
  text: string;
  /** Formatting mode applied to `text`. Mutually exclusive with `entities`. */
  parse_mode?: (typeof PARSE_MODES)[number];
  /** Pre-parsed formatting entities. Mutually exclusive with `parse_mode`. */
  entities?: unknown[];
  /** Link preview behavior for URLs found in `text`. */
  link_preview_options?: Record<string, unknown>;
  /** Unique identifier of the target message thread (topic), for forum supergroups. */
  message_thread_id?: number;
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
  /** Describes the message being replied to. Replaces the deprecated `reply_to_message_id`. */
  reply_parameters?: Record<string, unknown>;
  /** Inline keyboard, reply keyboard, or reply-removal/force-reply instruction. */
  reply_markup?: Record<string, unknown>;
};

/** Request body validated before POST /sendMessage. */
export const SendMessageRequestSchemaObject: BaseGuardian<
  SendMessageRequestSchema
> = Guardian.object({
  chat_id: chatIdGuard,
  text: Guardian.string().minLength(1).maxLength(4096),
  parse_mode: Guardian.enum(PARSE_MODES).optional(),
  entities: Guardian.array(Guardian.unknown()).optional(),
  link_preview_options: Guardian.object().passthrough().optional(),
  message_thread_id: Guardian.number().integer().optional(),
  business_connection_id: Guardian.string().optional(),
  message_effect_id: Guardian.string().optional(),
  disable_notification: Guardian.boolean().optional(),
  protect_content: Guardian.boolean().optional(),
  allow_paid_broadcast: Guardian.boolean().optional(),
  reply_parameters: Guardian.object().passthrough().optional(),
  reply_markup: Guardian.object().passthrough().optional(),
}).describe({
  title: 'sendMessage request',
  description: 'Request body validated before POST /sendMessage.',
});
