import { type BaseGuardian, Guardian } from '@guardian';
import { type MessageSchema, MessageSchemaObject } from './Message.ts';
import {
  type ResponseMetadataSchema,
  ResponseMetadataSchemaObject,
} from './Common.ts';

/**
 * Request schema for `GET /conversations.history`.
 *
 * @example
 * ```typescript
 * import { ConversationHistoryRequestSchemaObject } from '@tundraconnect/slack/schemas';
 *
 * const [error, request] = ConversationHistoryRequestSchemaObject.safeParse({
 *   channel: 'C123ABC456',
 *   limit: 50,
 * });
 * if (!error) {
 *   console.log(request.channel);
 * }
 * ```
 */
export type ConversationHistoryRequestSchema = {
  /** Conversation to fetch history for. */
  channel: string;
  /** Cursor from a previous response's `response_metadata.next_cursor`, to fetch the next page. */
  cursor?: string;
  /** Maximum messages to return per page (default 100, max 999). */
  limit?: number;
  /** Only messages after this Unix timestamp. Defaults to the beginning of the channel. */
  oldest?: string;
  /** Only messages before this Unix timestamp. Defaults to now. */
  latest?: string;
};

/** Request query parameters validated before `GET /conversations.history`. */
export const ConversationHistoryRequestSchemaObject: BaseGuardian<
  ConversationHistoryRequestSchema
> = Guardian.object({
  channel: Guardian.string().minLength(1),
  cursor: Guardian.string().optional(),
  limit: Guardian.number().integer().min(1).max(999).optional(),
  oldest: Guardian.string().optional(),
  latest: Guardian.string().optional(),
}).describe({
  title: 'conversations.history request',
  description:
    'Request query parameters validated before GET /conversations.history.',
});

/** Response schema for a successful `GET /conversations.history`. */
export type ConversationHistoryResponseSchema = {
  /** Always `true` — {@link Slack}'s response handler has already thrown for `ok: false`. */
  ok: boolean;
  /** The page of matching messages, newest first. */
  messages: MessageSchema[];
  /** Whether more messages are available before `oldest`/after this page. */
  has_more?: boolean;
  /** Cursor-pagination envelope for fetching the next page. */
  response_metadata?: ResponseMetadataSchema;
};

/** Response body returned by a successful `GET /conversations.history`. */
export const ConversationHistoryResponseSchemaObject: BaseGuardian<
  ConversationHistoryResponseSchema
> = Guardian.object({
  ok: Guardian.boolean(),
  messages: Guardian.array(MessageSchemaObject),
  has_more: Guardian.boolean().optional(),
  response_metadata: ResponseMetadataSchemaObject.optional(),
}).passthrough().describe({
  title: 'conversations.history response',
  description:
    'Response body returned by a successful GET /conversations.history.',
});
