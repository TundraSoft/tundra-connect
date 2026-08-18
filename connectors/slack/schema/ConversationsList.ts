import { type BaseGuardian, Guardian } from '@guardian';
import { type ChannelSchema, ChannelSchemaObject } from './Channel.ts';
import {
  type ResponseMetadataSchema,
  ResponseMetadataSchemaObject,
} from './Common.ts';

/**
 * Request schema for `GET /conversations.list`.
 *
 * @example
 * ```typescript
 * import { ListConversationsRequestSchemaObject } from '@tundraconnect/slack/schemas';
 *
 * const [error, request] = ListConversationsRequestSchemaObject.safeParse({
 *   limit: 200,
 *   exclude_archived: true,
 * });
 * if (!error) {
 *   console.log(request.limit);
 * }
 * ```
 */
export type ListConversationsRequestSchema = {
  /** Cursor from a previous response's `response_metadata.next_cursor`, to fetch the next page. */
  cursor?: string;
  /** Maximum conversations to return per page (default 100, max ~1000). */
  limit?: number;
  /** Exclude archived conversations from the list. Defaults to `false`. */
  exclude_archived?: boolean;
  /** Comma-separated conversation types to include (e.g. `'public_channel,private_channel'`). Defaults to `public_channel`. */
  types?: string;
};

/** Request query parameters validated before `GET /conversations.list`. */
export const ListConversationsRequestSchemaObject: BaseGuardian<
  ListConversationsRequestSchema
> = Guardian.object({
  cursor: Guardian.string().optional(),
  limit: Guardian.number().integer().min(1).max(1000).optional(),
  exclude_archived: Guardian.boolean().optional(),
  types: Guardian.string().optional(),
}).describe({
  title: 'conversations.list request',
  description:
    'Request query parameters validated before GET /conversations.list.',
});

/** Response schema for a successful `GET /conversations.list`. */
export type ListConversationsResponseSchema = {
  /** Always `true` — {@link Slack}'s response handler has already thrown for `ok: false`. */
  ok: boolean;
  /** The page of matching conversations. */
  channels: ChannelSchema[];
  /** Cursor-pagination envelope for fetching the next page. */
  response_metadata?: ResponseMetadataSchema;
};

/** Response body returned by a successful `GET /conversations.list`. */
export const ListConversationsResponseSchemaObject: BaseGuardian<
  ListConversationsResponseSchema
> = Guardian.object({
  ok: Guardian.boolean(),
  channels: Guardian.array(ChannelSchemaObject),
  response_metadata: ResponseMetadataSchemaObject.optional(),
}).passthrough().describe({
  title: 'conversations.list response',
  description:
    'Response body returned by a successful GET /conversations.list.',
});
