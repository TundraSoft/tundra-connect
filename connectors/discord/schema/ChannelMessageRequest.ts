import { type BaseGuardian, Guardian } from '@guardian';
import {
  type AllowedMentionsSchema,
  AllowedMentionsSchemaObject,
  snowflakeGuard,
  type SnowflakeSchema,
} from './Common.ts';
import {
  type EmbedSchema,
  EmbedSchemaObject,
  embedsWithinCharacterBudget,
} from './Embed.ts';

/**
 * Type definition for {@link Discord.sendChannelMessage} request options.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * ChannelMessageRequestSchemaObject>`) so the exported schema below can
 * carry an explicit `BaseGuardian<ChannelMessageRequestSchema>` annotation
 * without a circular reference — JSR's "slow types" check requires the
 * originating declaration of any type reachable from the public API to be
 * explicit.
 */
export type ChannelMessageRequestSchema = {
  /** Message text (max 2000 characters). One of `content`/`embeds` is required. */
  content?: string;
  /** Up to 10 embed objects. One of `content`/`embeds` is required. */
  embeds?: EmbedSchema[];
  /** Whether this is a text-to-speech message. */
  tts?: boolean;
  /** Controls which mentions in `content` actually notify someone. */
  allowed_mentions?: AllowedMentionsSchema;
  /** Reference to a message being replied to. */
  message_reference?: {
    /** ID of the message being referenced. */
    message_id?: SnowflakeSchema;
    /** ID of the channel the referenced message is in, if different from the destination channel. */
    channel_id?: SnowflakeSchema;
    /** ID of the guild the referenced message is in, when applicable. */
    guild_id?: SnowflakeSchema;
    /** Whether replying should fail (rather than send a normal message) if the referenced message no longer exists. */
    fail_if_not_exists?: boolean;
  };
  /** Message flags, as a bitfield. Only `SUPPRESS_EMBEDS` (`1 << 2`) and `SUPPRESS_NOTIFICATIONS` (`1 << 12`) may be set here. */
  flags?: number;
};

/**
 * Schema for {@link Discord.sendChannelMessage} request options.
 *
 * Validates the JSON body accepted by `POST /channels/{id}/messages`. This
 * connect scopes message creation to text + embed notifications (and
 * optionally replies via `message_reference`) — file uploads
 * (`files[n]`/`payload_json`), message components, stickers, and polls are
 * out of scope and not modelled here. Discord requires at least one of
 * `content`/`embeds`/`components`/`sticker_ids`/`files`/`poll`; since this
 * connect only supports the first two, at least one of `content`/`embeds`
 * is required.
 *
 * Unlike {@link WebhookMessageRequestSchemaObject}, `username`/`avatar_url`
 * are not accepted here — those are webhook-execution-only fields.
 *
 * @example
 * ```typescript
 * import { ChannelMessageRequestSchemaObject } from '@tundraconnect/discord/schemas';
 *
 * const [error, options] = ChannelMessageRequestSchemaObject.safeParse({
 *   content: 'Deploy succeeded',
 * });
 * if (!error) {
 *   console.log('Valid request:', options.content);
 * }
 * ```
 */
export const ChannelMessageRequestSchemaObject: BaseGuardian<
  ChannelMessageRequestSchema
> = Guardian.object({
  /** Message text (max 2000 characters). One of `content`/`embeds` is required. */
  content: Guardian.string().maxLength(2000).optional(),
  /** Up to 10 embed objects. One of `content`/`embeds` is required. */
  embeds: Guardian.array(EmbedSchemaObject).maxLength(10).optional(),
  /** Whether this is a text-to-speech message. */
  tts: Guardian.boolean().optional(),
  /** Controls which mentions in `content` actually notify someone. */
  allowed_mentions: AllowedMentionsSchemaObject.optional(),
  /** Reference to a message being replied to. */
  message_reference: Guardian.object({
    /** ID of the message being referenced. */
    message_id: snowflakeGuard.optional(),
    /** ID of the channel the referenced message is in, if different from the destination channel. */
    channel_id: snowflakeGuard.optional(),
    /** ID of the guild the referenced message is in, when applicable. */
    guild_id: snowflakeGuard.optional(),
    /** Whether replying should fail (rather than send a normal message) if the referenced message no longer exists. */
    fail_if_not_exists: Guardian.boolean().optional(),
  }).optional(),
  /** Message flags, as a bitfield. Only `SUPPRESS_EMBEDS` (`1 << 2`) and `SUPPRESS_NOTIFICATIONS` (`1 << 12`) may be set here. */
  flags: Guardian.number().integer().optional(),
}).refine(
  (data) =>
    Boolean(data.content) ||
    (Array.isArray(data.embeds) && data.embeds.length > 0),
  "At least one of 'content' or 'embeds' is required",
).refine(
  (data) => embedsWithinCharacterBudget(data.embeds),
  "Combined embed text ('title' + 'description' + field 'name'/'value' + 'footer.text' + 'author.name', across all embeds) must not exceed 6000 characters",
).describe({
  title: 'Create message request',
  description:
    'Options accepted by Discord.sendChannelMessage(), validated before the API call.',
});
