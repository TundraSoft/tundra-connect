import { type BaseGuardian, Guardian } from '@guardian';
import {
  type PublishActionSchema,
  PublishActionSchemaObject,
} from './PublishRequest.ts';

/**
 * Type definition for a published message's attachment metadata.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * PublishAttachmentSchemaObject>`) so `PublishAttachmentSchemaObject` below
 * can carry an explicit `BaseGuardian<PublishAttachmentSchema>` annotation
 * directly on its declaration — JSR's "slow types" check flags any
 * unexported intermediate `const` reachable (even via `typeof`) from a
 * public export, so the type has to be pinned here instead of inferred
 * through a builder chain.
 */
export type PublishAttachmentSchema = {
  /** File name. */
  name: string;
  /** URL the attachment can be downloaded from. */
  url: string;
  /** MIME type, when known. */
  type?: string;
  /** Size in bytes, when known. */
  size?: number;
  /** Unix timestamp the attachment expires at. */
  expires?: number;
};

/**
 * Schema for a published message's attachment metadata, echoed back on the
 * response when the request carried an `attach` URL.
 *
 * @example
 * ```typescript
 * import { PublishAttachmentSchemaObject } from '@tundraconnect/ntfy/schemas';
 *
 * const [error, attachment] = PublishAttachmentSchemaObject.safeParse({
 *   name: 'camera.jpg',
 *   url: 'https://ntfy.sh/file/sPs71M8A2T.jpg',
 * });
 * ```
 */
export const PublishAttachmentSchemaObject: BaseGuardian<
  PublishAttachmentSchema
> = Guardian.object({
  name: Guardian.string(),
  url: Guardian.string(),
  type: Guardian.string().optional(),
  size: Guardian.number().integer().optional(),
  expires: Guardian.number().optional(),
}).describe({
  title: 'ntfy attachment',
  description: "A published message's attachment metadata.",
});

/**
 * Type definition for the ntfy `POST /` JSON publish response body.
 * Hand-written — see {@link PublishAttachmentSchema} for why.
 */
export type PublishResponseSchema = {
  /** Randomly chosen message identifier. */
  id: string;
  /** Message date/time, as a Unix timestamp. */
  time: number;
  /** Unix timestamp indicating when the message will be deleted. */
  expires?: number;
  /** Always `"message"` for a publish response. */
  event: 'message';
  /** Topic the message was published to. */
  topic: string;
  /** Notification body text, echoed back when set. */
  message?: string;
  /** Notification title, echoed back when set. */
  title?: string;
  /** Message priority: `1` (min) through `5` (max). */
  priority?: number;
  /** Tags, echoed back when set. */
  tags?: string[];
  /** Click-through URL, echoed back when set. */
  click?: string;
  /** Action buttons, echoed back when set. */
  actions?: PublishActionSchema[];
  /** Attachment metadata, present when the request carried an `attach` URL. */
  attachment?: PublishAttachmentSchema;
  /** Whether `message` should be rendered as Markdown. */
  markdown?: boolean;
};

/**
 * Schema for the ntfy `POST /` JSON publish response body
 *
 * Validates the message envelope ntfy returns on a successful publish — see
 * {@link https://docs.ntfy.sh/subscribe/api/#json-message-format ntfy's JSON message format}.
 * `event` is always `"message"` for a publish response (the other event
 * types — `open`, `keepalive`, `poll_request` — only occur when
 * subscribing).
 *
 * @example
 * ```typescript
 * import { PublishResponseSchemaObject } from '@tundraconnect/ntfy/schemas';
 *
 * const [error, response] = PublishResponseSchemaObject.safeParse({
 *   id: 'sPs71M8A2T',
 *   time: 1643935928,
 *   event: 'message',
 *   topic: 'mytopic',
 *   message: 'Hello from ntfy!',
 * });
 * if (!error) {
 *   console.log(response.id);
 * }
 * ```
 */
export const PublishResponseSchemaObject: BaseGuardian<PublishResponseSchema> =
  Guardian.object({
    id: Guardian.string(),
    time: Guardian.number(),
    expires: Guardian.number().optional(),
    event: Guardian.literal('message'),
    topic: Guardian.string(),
    message: Guardian.string().optional(),
    title: Guardian.string().optional(),
    priority: Guardian.number().integer().min(1).max(5).optional(),
    tags: Guardian.array(Guardian.string()).optional(),
    click: Guardian.string().optional(),
    actions: Guardian.array(PublishActionSchemaObject).optional(),
    attachment: PublishAttachmentSchemaObject.optional(),
    markdown: Guardian.boolean().optional(),
  }).describe({
    title: 'ntfy publish response',
    description: 'Response body for a successful POST / (JSON publish form).',
  });
