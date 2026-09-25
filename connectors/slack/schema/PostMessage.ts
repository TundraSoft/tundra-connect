import { type BaseGuardian, Guardian } from '@guardian';
import { type MessageSchema, MessageSchemaObject } from './Message.ts';
import { slackTimestampGuard } from './Common.ts';

/** Documented `parse` values controlling how `chat.postMessage` treats plain-text links/mentions. */
export const POST_MESSAGE_PARSE_MODES = ['full', 'none'] as const;

/**
 * Request schema for `POST /chat.postMessage`.
 *
 * `text` is modeled as required for a clean v1 surface. Slack's own
 * contract only requires `text` OR `blocks`/`attachments`, but Block Kit's
 * `blocks` structure is a large, independently-versioned mini-language
 * this connect does not attempt to model — sending rich messages via
 * `blocks`/`attachments` is out of scope for now. `text` also doubles as
 * the accessibility/notification fallback even on a `blocks` message, so
 * requiring it here doesn't lose anything a v1 caller needs.
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived) for the
 * same JSR "slow types" reason documented on {@link MessageSchema}.
 *
 * @example
 * ```typescript
 * import { PostMessageRequestSchemaObject } from '@tundraconnect/slack/schemas';
 *
 * const [error, request] = PostMessageRequestSchemaObject.safeParse({
 *   channel: 'C123ABC456',
 *   text: 'Deploy succeeded',
 * });
 * if (!error) {
 *   console.log(request.channel);
 * }
 * ```
 */
export type PostMessageRequestSchema = {
  /** Channel, private group, or IM channel to send the message to — an encoded ID or channel name. */
  channel: string;
  /** Message text; also the notification/accessibility fallback when the message otherwise uses Block Kit. */
  text: string;
  /** Parent message timestamp — posts this message as a threaded reply. */
  thread_ts?: string;
  /** Enable unfurling of primarily text-based content. */
  unfurl_links?: boolean;
  /** Enable unfurling of media content. */
  unfurl_media?: boolean;
  /** Broadcast a threaded reply to the whole channel too. Only meaningful together with `thread_ts`. */
  reply_broadcast?: boolean;
  /** Disable Slack markup parsing (`*bold*`, `_italic_`, ...) by setting to `false`. Defaults to `true`. */
  mrkdwn?: boolean;
  /** Change how messages are treated for the purpose of unfurling/linking; `'full'` or `'none'`. */
  parse?: (typeof POST_MESSAGE_PARSE_MODES)[number];
  /** Bot's display name for this message. Requires the app to post as a bot user. */
  username?: string;
  /** Emoji (e.g. `:robot_face:`) to use as this message's icon. Requires `username`. */
  icon_emoji?: string;
  /** URL to an image to use as this message's icon. Requires `username`. */
  icon_url?: string;
};

/** Request body validated before `POST /chat.postMessage`. */
export const PostMessageRequestSchemaObject: BaseGuardian<
  PostMessageRequestSchema
> = Guardian.object({
  channel: Guardian.string().minLength(1),
  text: Guardian.string().minLength(1),
  thread_ts: Guardian.string().optional(),
  unfurl_links: Guardian.boolean().optional(),
  unfurl_media: Guardian.boolean().optional(),
  reply_broadcast: Guardian.boolean().optional(),
  mrkdwn: Guardian.boolean().optional(),
  parse: Guardian.enum(POST_MESSAGE_PARSE_MODES).optional(),
  username: Guardian.string().optional(),
  icon_emoji: Guardian.string().optional(),
  icon_url: Guardian.string().optional(),
}).describe({
  title: 'chat.postMessage request',
  description: 'Request body validated before POST /chat.postMessage.',
});

/**
 * Response schema for a successful `POST /chat.postMessage`.
 *
 * Hand-written for the same JSR "slow types" reason documented on
 * {@link MessageSchema}.
 */
export type PostMessageResponseSchema = {
  /** Always `true` — {@link Slack}'s response handler has already thrown for `ok: false`. */
  ok: boolean;
  /** The channel the message was posted to. */
  channel: string;
  /** The new message's timestamp — its unique id within the channel. */
  ts: string;
  /** The message as Slack stored it. */
  message: MessageSchema;
};

/** Response body returned by a successful `POST /chat.postMessage`. */
export const PostMessageResponseSchemaObject: BaseGuardian<
  PostMessageResponseSchema
> = Guardian.object({
  ok: Guardian.boolean(),
  channel: Guardian.string(),
  ts: slackTimestampGuard,
  message: MessageSchemaObject,
}).passthrough().describe({
  title: 'chat.postMessage response',
  description: 'Response body returned by a successful POST /chat.postMessage.',
});
