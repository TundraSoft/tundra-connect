import { type BaseGuardian, Guardian } from '@guardian';
import { snowflakeGuard, type SnowflakeSchema } from './Common.ts';
import { type EmbedSchema, EmbedSchemaObject } from './Embed.ts';

/**
 * Schema for the Discord Message resource, returned both by
 * `POST /channels/{id}/messages` and by `POST /webhooks/{id}/{token}` when
 * called with `?wait=true`.
 *
 * Models the fields relevant to a message a caller just sent; Discord's
 * full Message resource carries many more optional, feature-specific
 * fields (polls, threads, interactions, components, stickers, ...) that
 * grow over time, so this schema `.passthrough()`es rather than
 * exhaustively modelling every one of them.
 *
 * @example
 * ```typescript
 * import { MessageSchemaObject } from '@tundraconnect/discord/schemas';
 *
 * const [error, message] = MessageSchemaObject.safeParse({
 *   id: '123456789012345678',
 *   channel_id: '234567890123456789',
 *   author: { id: '345678901234567890', username: 'webhook-bot', discriminator: '0000' },
 *   content: 'Deploy succeeded',
 *   timestamp: '2024-01-01T12:00:00.000000+00:00',
 *   edited_timestamp: null,
 *   tts: false,
 *   mention_everyone: false,
 *   mentions: [],
 *   mention_roles: [],
 *   attachments: [],
 *   embeds: [],
 *   pinned: false,
 *   type: 0,
 * });
 * if (!error) {
 *   console.log('Sent message:', message.id);
 * }
 * ```
 */

/**
 * Type definition for the (partial) Discord User resource.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * DiscordUserSchemaObject>`) so the exported schema below can carry an
 * explicit `BaseGuardian<DiscordUserSchema>` annotation without a circular
 * reference — JSR's "slow types" check requires the originating declaration
 * of any type reachable from the public API to be explicit.
 */
export type DiscordUserSchema = {
  /** The user's ID. */
  id: SnowflakeSchema;
  /** The user's username. For a webhook-authored message, this is the webhook's configured name. */
  username: string;
  /** The user's 4-digit Discord tag; `'0'` for users migrated to the new username system. */
  discriminator: string;
  /** The user's display name, if set; `null` otherwise. */
  global_name?: string | null;
  /** The user's avatar hash; `null` if using the default avatar. */
  avatar?: string | null;
  /** Whether the user belongs to an OAuth2 application (always `true` for a bot-sent message's author). */
  bot?: boolean;
  /** Whether the user is the official Discord system user. */
  system?: boolean;
  /** The public flags on the user's account, as a bitfield. */
  public_flags?: number;
};

/** Schema for the (partial) Discord User resource embedded in a message's `author`/`mentions`. */
export const DiscordUserSchemaObject: BaseGuardian<DiscordUserSchema> = Guardian
  .object({
    /** The user's ID. */
    id: snowflakeGuard,
    /** The user's username. For a webhook-authored message, this is the webhook's configured name. */
    username: Guardian.string(),
    /** The user's 4-digit Discord tag; `'0'` for users migrated to the new username system. */
    discriminator: Guardian.string(),
    /** The user's display name, if set; `null` otherwise. */
    global_name: Guardian.string().nullable().optional(),
    /** The user's avatar hash; `null` if using the default avatar. */
    avatar: Guardian.string().nullable().optional(),
    /** Whether the user belongs to an OAuth2 application (always `true` for a bot-sent message's author). */
    bot: Guardian.boolean().optional(),
    /** Whether the user is the official Discord system user. */
    system: Guardian.boolean().optional(),
    /** The public flags on the user's account, as a bitfield. */
    public_flags: Guardian.number().integer().optional(),
  }).passthrough().describe({
    title: 'Discord user (partial)',
    description:
      "Subset of the Discord User resource, as embedded in a Message's `author`/`mentions` fields.",
  });

/** Type definition for one entry of `message.attachments`. */
export type AttachmentSchema = {
  /** Attachment ID. */
  id: SnowflakeSchema;
  /** Name of the uploaded file. */
  filename: string;
  /** Size of the file, in bytes. */
  size: number;
  /** Source URL of the file. */
  url: string;
  /** Discord's proxied copy of `url`. */
  proxy_url: string;
  /** The attachment's media type, when Discord could detect one. */
  content_type?: string;
  /** Height of the file, for image attachments. */
  height?: number | null;
  /** Width of the file, for image attachments. */
  width?: number | null;
  /** Whether this attachment is ephemeral (auto-removed after a set time). */
  ephemeral?: boolean;
};

/** Schema for one entry of `message.attachments`. */
export const AttachmentSchemaObject: BaseGuardian<AttachmentSchema> = Guardian
  .object({
    /** Attachment ID. */
    id: snowflakeGuard,
    /** Name of the uploaded file. */
    filename: Guardian.string(),
    /** Size of the file, in bytes. */
    size: Guardian.number().integer(),
    /** Source URL of the file. */
    url: Guardian.string(),
    /** Discord's proxied copy of `url`. */
    proxy_url: Guardian.string(),
    /** The attachment's media type, when Discord could detect one. */
    content_type: Guardian.string().optional(),
    /** Height of the file, for image attachments. */
    height: Guardian.number().integer().nullable().optional(),
    /** Width of the file, for image attachments. */
    width: Guardian.number().integer().nullable().optional(),
    /** Whether this attachment is ephemeral (auto-removed after a set time). */
    ephemeral: Guardian.boolean().optional(),
  }).passthrough().describe({
    title: 'Attachment',
    description: 'One entry of a message`s `attachments` array.',
  });

/**
 * Type definition for the Discord Message resource.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * MessageSchemaObject>`) so the exported schema below can carry an explicit
 * `BaseGuardian<MessageSchema>` annotation without a circular reference —
 * JSR's "slow types" check requires the originating declaration of any type
 * reachable from the public API to be explicit.
 */
export type MessageSchema = {
  /** The message's ID. */
  id: SnowflakeSchema;
  /** The channel the message was sent in. */
  channel_id: SnowflakeSchema;
  /** The author of the message — the webhook's identity for a webhook-sent message, or the bot user for a bot-sent one. */
  author: DiscordUserSchema;
  /** Message text content. */
  content: string;
  /** ISO 8601 timestamp the message was sent. */
  timestamp: string;
  /** ISO 8601 timestamp the message was last edited; `null` if never edited. */
  edited_timestamp: string | null;
  /** Whether this was a text-to-speech message. */
  tts: boolean;
  /** Whether the message mentions everyone/here. */
  mention_everyone: boolean;
  /** Users specifically mentioned in the message. */
  mentions: DiscordUserSchema[];
  /** Role IDs specifically mentioned in the message. */
  mention_roles: string[];
  /** Files attached to the message. */
  attachments: AttachmentSchema[];
  /** Embedded content attached to the message. */
  embeds: EmbedSchema[];
  /** Whether the message is pinned in its channel. */
  pinned: boolean;
  /** Discord's numeric message type (e.g. `0` for a normal/`DEFAULT` message). */
  type: number;
  /** ID of the webhook that sent this message, when applicable. */
  webhook_id?: SnowflakeSchema;
  /** Message flags, as a bitfield (e.g. `SUPPRESS_EMBEDS`). */
  flags?: number;
  /** Interactive components attached to the message, if any. Not deeply validated by this connect. */
  components?: unknown[];
};

/** Schema for the Discord Message resource. */
export const MessageSchemaObject: BaseGuardian<MessageSchema> = Guardian
  .object({
    /** The message's ID. */
    id: snowflakeGuard,
    /** The channel the message was sent in. */
    channel_id: snowflakeGuard,
    /** The author of the message — the webhook's identity for a webhook-sent message, or the bot user for a bot-sent one. */
    author: DiscordUserSchemaObject,
    /** Message text content. */
    content: Guardian.string(),
    /** ISO 8601 timestamp the message was sent. */
    timestamp: Guardian.string(),
    /** ISO 8601 timestamp the message was last edited; `null` if never edited. */
    edited_timestamp: Guardian.string().nullable(),
    /** Whether this was a text-to-speech message. */
    tts: Guardian.boolean(),
    /** Whether the message mentions everyone/here. */
    mention_everyone: Guardian.boolean(),
    /** Users specifically mentioned in the message. */
    mentions: Guardian.array(DiscordUserSchemaObject),
    /** Role IDs specifically mentioned in the message. */
    mention_roles: Guardian.array(Guardian.string()),
    /** Files attached to the message. */
    attachments: Guardian.array(AttachmentSchemaObject),
    /** Embedded content attached to the message. */
    embeds: Guardian.array(EmbedSchemaObject),
    /** Whether the message is pinned in its channel. */
    pinned: Guardian.boolean(),
    /** Discord's numeric message type (e.g. `0` for a normal/`DEFAULT` message). */
    type: Guardian.number().integer(),
    /** ID of the webhook that sent this message, when applicable. */
    webhook_id: snowflakeGuard.optional(),
    /** Message flags, as a bitfield (e.g. `SUPPRESS_EMBEDS`). */
    flags: Guardian.number().integer().optional(),
    /** Interactive components attached to the message, if any. Not deeply validated by this connect. */
    components: Guardian.array(Guardian.unknown()).optional(),
  }).passthrough().describe({
    title: 'Message resource',
    description:
      'A Discord Message resource, as returned by Create Message and by Execute Webhook when called with `wait=true`.',
  });
