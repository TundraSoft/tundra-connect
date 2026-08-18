import { type BaseGuardian, Guardian } from '@guardian';
import { slackTimestampGuard } from './Common.ts';

/**
 * Request schema for `POST /chat.delete`.
 *
 * @example
 * ```typescript
 * import { DeleteMessageRequestSchemaObject } from '@tundraconnect/slack/schemas';
 *
 * const [error, request] = DeleteMessageRequestSchemaObject.safeParse({
 *   channel: 'C123ABC456',
 *   ts: '1401383885.000061',
 * });
 * if (!error) {
 *   console.log(request.ts);
 * }
 * ```
 */
export type DeleteMessageRequestSchema = {
  /** Channel containing the message to delete. */
  channel: string;
  /** Timestamp of the message to delete. */
  ts: string;
};

/** Request body validated before `POST /chat.delete`. */
export const DeleteMessageRequestSchemaObject: BaseGuardian<
  DeleteMessageRequestSchema
> = Guardian.object({
  channel: Guardian.string().minLength(1),
  ts: slackTimestampGuard,
}).describe({
  title: 'chat.delete request',
  description: 'Request body validated before POST /chat.delete.',
});

/** Response schema for a successful `POST /chat.delete`. */
export type DeleteMessageResponseSchema = {
  /** Always `true` — {@link Slack}'s response handler has already thrown for `ok: false`. */
  ok: boolean;
  /** The channel the deleted message was in. */
  channel: string;
  /** Timestamp of the now-deleted message. */
  ts: string;
};

/** Response body returned by a successful `POST /chat.delete`. */
export const DeleteMessageResponseSchemaObject: BaseGuardian<
  DeleteMessageResponseSchema
> = Guardian.object({
  ok: Guardian.boolean(),
  channel: Guardian.string(),
  ts: slackTimestampGuard,
}).passthrough().describe({
  title: 'chat.delete response',
  description: 'Response body returned by a successful POST /chat.delete.',
});
