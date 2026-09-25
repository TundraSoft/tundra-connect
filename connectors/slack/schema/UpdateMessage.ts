import { type BaseGuardian, Guardian } from '@guardian';
import { slackTimestampGuard } from './Common.ts';

/**
 * Request schema for `POST /chat.update`.
 *
 * Slack additionally accepts `blocks`/`attachments` here — out of scope for
 * v1, same as {@link PostMessageRequestSchema}; `text` is required.
 *
 * @example
 * ```typescript
 * import { UpdateMessageRequestSchemaObject } from '@tundraconnect/slack/schemas';
 *
 * const [error, request] = UpdateMessageRequestSchemaObject.safeParse({
 *   channel: 'C123ABC456',
 *   ts: '1401383885.000061',
 *   text: 'Updated text you carefully authored',
 * });
 * if (!error) {
 *   console.log(request.text);
 * }
 * ```
 */
export type UpdateMessageRequestSchema = {
  /** Channel containing the message to update. */
  channel: string;
  /** Timestamp of the message to update. */
  ts: string;
  /** New message text. */
  text: string;
};

/** Request body validated before `POST /chat.update`. */
export const UpdateMessageRequestSchemaObject: BaseGuardian<
  UpdateMessageRequestSchema
> = Guardian.object({
  channel: Guardian.string().minLength(1),
  ts: slackTimestampGuard,
  text: Guardian.string().minLength(1),
}).describe({
  title: 'chat.update request',
  description: 'Request body validated before POST /chat.update.',
});

/**
 * Response schema for a successful `POST /chat.update`.
 *
 * `message` is modeled loosely (`Record<string, unknown>`) rather than
 * reusing {@link MessageSchema}: Slack's own documented example response
 * for this endpoint shows a reduced echo (`{ text, user }`, missing
 * `type`/`ts`) rather than the fuller message resource `chat.postMessage`
 * returns — reusing the stricter schema here would risk rejecting a
 * genuinely successful response.
 */
export type UpdateMessageResponseSchema = {
  /** Always `true` — {@link Slack}'s response handler has already thrown for `ok: false`. */
  ok: boolean;
  /** The channel containing the updated message. */
  channel: string;
  /** The updated message's timestamp (unchanged by an update). */
  ts: string;
  /** The message's new text. */
  text: string;
  /** Echo of the updated message; shape not exhaustively documented by Slack. */
  message?: Record<string, unknown>;
};

/** Response body returned by a successful `POST /chat.update`. */
export const UpdateMessageResponseSchemaObject: BaseGuardian<
  UpdateMessageResponseSchema
> = Guardian.object({
  ok: Guardian.boolean(),
  channel: Guardian.string(),
  ts: slackTimestampGuard,
  text: Guardian.string(),
  message: Guardian.object().passthrough().optional(),
}).passthrough().describe({
  title: 'chat.update response',
  description: 'Response body returned by a successful POST /chat.update.',
});
