import { type BaseGuardian, Guardian } from '@guardian';
import { chatIdGuard, type ChatIdSchema } from './Common.ts';

/**
 * Request schema for `POST /deleteMessage`.
 *
 * Telegram limits what a bot may delete: a message older than 48 hours
 * can't be deleted, and in groups and channels the bot needs the matching
 * administrator rights. Those rules are Telegram's to check; a refusal
 * arrives as a `400 Bad Request`.
 *
 * @example
 * ```typescript
 * import { DeleteMessageRequestSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * DeleteMessageRequestSchemaObject.parse({ chat_id: 123456789, message_id: 42 });
 * ```
 */
export type DeleteMessageRequestSchema = {
  /** Chat the message is in. */
  chat_id: ChatIdSchema;
  /** The message to delete. */
  message_id: number;
};

/** Request body validated before POST /deleteMessage. */
export const DeleteMessageRequestSchemaObject: BaseGuardian<
  DeleteMessageRequestSchema
> = Guardian.object({
  chat_id: chatIdGuard,
  message_id: Guardian.number().integer().strict(),
}).strict().describe({
  title: 'deleteMessage request',
  description: 'Request body validated before POST /deleteMessage.',
});
