import { type BaseGuardian, Guardian } from '@guardian';
import { slackTimestampGuard, type SlackTimestampSchema } from './Common.ts';

/**
 * Schema for the message object embedded in a `chat.postMessage` response
 * and each entry of `conversations.history`'s `messages` array.
 *
 * Slack's message resource has dozens of type/subtype-specific optional
 * fields (Block Kit blocks, attachments, files, reactions, thread
 * metadata, ...) that grow over time — this models the fields relevant to
 * a message a caller just sent or is paging through; `.passthrough()`
 * keeps the rest reachable at runtime without a schema update.
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived): JSR's
 * public-API "slow types" check requires the *originating* declaration of
 * any type reachable from the public API to carry an explicit annotation
 * — so the shape is pinned directly here rather than threaded through an
 * internal helper (mirrors `connectors/discord/schema/Message.ts`).
 *
 * @example
 * ```typescript
 * import { MessageSchemaObject } from '@tundraconnect/slack/schemas';
 *
 * const [error, message] = MessageSchemaObject.safeParse({
 *   type: 'message',
 *   ts: '1503435956.000247',
 *   text: "Here's a message for you",
 *   bot_id: 'B123ABC456',
 * });
 * if (!error) {
 *   console.log(message.ts);
 * }
 * ```
 */
export type MessageSchema = {
  /** Slack's fixed value for a normal message (`'message'`). */
  type: string;
  /** Message subtype (e.g. `bot_message`, `channel_join`), when applicable. */
  subtype?: string;
  /** This message's timestamp — its unique id within the channel. */
  ts: SlackTimestampSchema;
  /** Message text. */
  text?: string;
  /** Posting user's id, for a user-authored message. */
  user?: string;
  /** Display name the message was posted under, for a bot/webhook-authored message. */
  username?: string;
  /** Posting bot's id, for a bot-authored message. */
  bot_id?: string;
  /** Timestamp of the parent message, when this message is part of a thread. */
  thread_ts?: SlackTimestampSchema;
  /** Number of replies, on a thread's parent message. */
  reply_count?: number;
};

/** Schema for a Slack message resource. */
export const MessageSchemaObject: BaseGuardian<MessageSchema> = Guardian
  .object({
    type: Guardian.string(),
    subtype: Guardian.string().optional(),
    ts: slackTimestampGuard,
    text: Guardian.string().optional(),
    user: Guardian.string().optional(),
    username: Guardian.string().optional(),
    bot_id: Guardian.string().optional(),
    thread_ts: slackTimestampGuard.optional(),
    reply_count: Guardian.number().integer().optional(),
  }).passthrough().describe({
    title: 'Message',
    description:
      "A Slack message resource, as embedded in chat.postMessage's response and conversations.history's messages array.",
  });
