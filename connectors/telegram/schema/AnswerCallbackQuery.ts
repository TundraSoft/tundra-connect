import { type BaseGuardian, Guardian } from '@guardian';

/** Maximum `answerCallbackQuery` notification text length, in characters. */
export const CALLBACK_ANSWER_TEXT_MAX_LENGTH = 200;

/**
 * Request schema for `POST /answerCallbackQuery`.
 *
 * Telegram clients show a progress indicator after a callback button is
 * pressed until the bot answers, so answer every callback query, even with
 * no `text`. `text` is 0-200 characters; the local check counts UTF-16
 * code units (`text.length`).
 *
 * @example
 * ```typescript
 * import { AnswerCallbackQueryRequestSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, request] = AnswerCallbackQueryRequestSchemaObject.safeParse({
 *   callback_query_id: '4382bfdwdsb323b2d9',
 *   text: 'Muted for 1 hour',
 * });
 * if (!error) {
 *   console.log(request.text);
 * }
 * ```
 */
export type AnswerCallbackQueryRequestSchema = {
  /** The `id` of the callback query being answered. */
  callback_query_id: string;
  /** Notification text; nothing is shown when omitted. 0-200 characters. */
  text?: string;
  /** Show an alert dialog instead of a notification at the top of the chat. */
  show_alert?: boolean;
  /**
   * URL the user's client opens: a game URL for a `callback_game` button,
   * or a `t.me/your_bot?start=...` link.
   */
  url?: string;
  /** Seconds the answer may be cached client-side. Telegram defaults to 0. */
  cache_time?: number;
};

/** Request body validated before POST /answerCallbackQuery. */
export const AnswerCallbackQueryRequestSchemaObject: BaseGuardian<
  AnswerCallbackQueryRequestSchema
> = Guardian.object({
  callback_query_id: Guardian.string().minLength(1),
  text: Guardian.string().maxLength(CALLBACK_ANSWER_TEXT_MAX_LENGTH)
    .optional(),
  show_alert: Guardian.boolean().strict().optional(),
  url: Guardian.string().minLength(1).optional(),
  cache_time: Guardian.number().integer().min(0).strict().optional(),
}).strict().describe({
  title: 'answerCallbackQuery request',
  description: 'Request body validated before POST /answerCallbackQuery.',
});
