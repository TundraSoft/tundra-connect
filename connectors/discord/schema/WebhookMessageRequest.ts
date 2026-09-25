import { type BaseGuardian, Guardian } from '@guardian';
import {
  type AllowedMentionsSchema,
  AllowedMentionsSchemaObject,
} from './Common.ts';
import {
  type EmbedSchema,
  EmbedSchemaObject,
  embedsWithinCharacterBudget,
} from './Embed.ts';

/**
 * Type definition for {@link Discord.sendWebhookMessage} request options.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * WebhookMessageRequestSchemaObject>`) so the exported schema below can
 * carry an explicit `BaseGuardian<WebhookMessageRequestSchema>` annotation
 * without a circular reference — JSR's "slow types" check requires the
 * originating declaration of any type reachable from the public API to be
 * explicit.
 */
export type WebhookMessageRequestSchema = {
  /** Message text (max 2000 characters). One of `content`/`embeds` is required. */
  content?: string;
  /** Up to 10 embed objects. One of `content`/`embeds` is required. */
  embeds?: EmbedSchema[];
  /** Overrides the webhook's default username for this message. */
  username?: string;
  /** Overrides the webhook's default avatar for this message. */
  avatar_url?: string;
  /** Whether this is a text-to-speech message. */
  tts?: boolean;
  /** Controls which mentions in `content` actually notify someone. */
  allowed_mentions?: AllowedMentionsSchema;
  /** Message flags, as a bitfield. Only `SUPPRESS_EMBEDS` (`1 << 2`) and `SUPPRESS_NOTIFICATIONS` (`1 << 12`) may be set here. */
  flags?: number;
  /** Name for the auto-created thread, when executing a webhook on a forum/media channel. */
  thread_name?: string;
};

/**
 * Schema for {@link Discord.sendWebhookMessage} request options.
 *
 * Validates the JSON body accepted by `POST /webhooks/{id}/{token}`. This
 * connect scopes webhook execution to text + embed notifications — file
 * uploads (`files[n]`/`payload_json`), message components, and polls are
 * out of scope and not modelled here. Discord requires at least one of
 * `content`/`embeds`/`components`/`files`/`poll`; since this connect only
 * supports the first two, at least one of `content`/`embeds` is required.
 *
 * `username`/`avatar_url` override the webhook's configured identity for
 * this one message and are only valid here — the bot API's create-message
 * endpoint ({@link ChannelMessageRequestSchemaObject}) rejects them.
 *
 * @example
 * ```typescript
 * import { WebhookMessageRequestSchemaObject } from '@tundraconnect/discord/schemas';
 *
 * const [error, options] = WebhookMessageRequestSchemaObject.safeParse({
 *   content: 'Deploy succeeded',
 *   username: 'Deploy Bot',
 * });
 * if (!error) {
 *   console.log('Valid request:', options.content);
 * }
 * ```
 */
export const WebhookMessageRequestSchemaObject: BaseGuardian<
  WebhookMessageRequestSchema
> = Guardian.object({
  /** Message text (max 2000 characters). One of `content`/`embeds` is required. */
  content: Guardian.string().maxLength(2000).optional(),
  /** Up to 10 embed objects. One of `content`/`embeds` is required. */
  embeds: Guardian.array(EmbedSchemaObject).maxLength(10).optional(),
  /** Overrides the webhook's default username for this message. */
  username: Guardian.string().minLength(1).optional(),
  /** Overrides the webhook's default avatar for this message. */
  avatar_url: Guardian.string().url().optional(),
  /** Whether this is a text-to-speech message. */
  tts: Guardian.boolean().optional(),
  /** Controls which mentions in `content` actually notify someone. */
  allowed_mentions: AllowedMentionsSchemaObject.optional(),
  /** Message flags, as a bitfield. Only `SUPPRESS_EMBEDS` (`1 << 2`) and `SUPPRESS_NOTIFICATIONS` (`1 << 12`) may be set here. */
  flags: Guardian.number().integer().optional(),
  /** Name for the auto-created thread, when executing a webhook on a forum/media channel. */
  thread_name: Guardian.string().optional(),
}).refine(
  (data) =>
    Boolean(data.content) ||
    (Array.isArray(data.embeds) && data.embeds.length > 0),
  "At least one of 'content' or 'embeds' is required",
).refine(
  (data) => embedsWithinCharacterBudget(data.embeds),
  "Combined embed text ('title' + 'description' + field 'name'/'value' + 'footer.text' + 'author.name', across all embeds) must not exceed 6000 characters",
).describe({
  title: 'Execute webhook request',
  description:
    'Options accepted by Discord.sendWebhookMessage(), validated before the API call.',
});
