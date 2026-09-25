import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Schema for the Discord Embed object — shared by webhook execution
 * (`POST /webhooks/{id}/{token}`) and channel message creation
 * (`POST /channels/{id}/messages`), both as an outgoing request field and
 * as part of the `embeds` array on a returned {@link MessageSchema}.
 *
 * @example
 * ```typescript
 * import { EmbedSchemaObject } from '@tundraconnect/discord/schemas';
 *
 * const [error, embed] = EmbedSchemaObject.safeParse({
 *   title: 'Deploy succeeded',
 *   description: 'Build #482 shipped to production.',
 *   color: 0x57f287,
 *   fields: [{ name: 'Duration', value: '48s', inline: true }],
 * });
 * if (!error) {
 *   console.log('Valid embed:', embed.title);
 * }
 * ```
 */

/** Max length of `embed.title`. */
export const EMBED_TITLE_MAX_LENGTH = 256;
/** Max length of `embed.description`. */
export const EMBED_DESCRIPTION_MAX_LENGTH = 4096;
/** Max length of `embed.fields[n].name`. */
export const EMBED_FIELD_NAME_MAX_LENGTH = 256;
/** Max length of `embed.fields[n].value`. */
export const EMBED_FIELD_VALUE_MAX_LENGTH = 1024;
/** Max length of `embed.footer.text`. */
export const EMBED_FOOTER_TEXT_MAX_LENGTH = 2048;
/** Max length of `embed.author.name`. */
export const EMBED_AUTHOR_NAME_MAX_LENGTH = 256;
/** Max number of entries in `embed.fields`. */
export const EMBED_MAX_FIELDS = 25;
/** Max value of `embed.color` (a 24-bit RGB integer). */
export const EMBED_MAX_COLOR = 0xffffff;
/**
 * Discord's documented combined character budget: the sum of every
 * `title` + `description` + `field.name` + `field.value` + `footer.text` +
 * `author.name`, across ALL embeds attached to a single message, must not
 * exceed this value.
 */
export const EMBED_TOTAL_CHARACTER_LIMIT = 6000;

/**
 * Type definition for `embed.footer`.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * EmbedFooterSchemaObject>`) so the exported schema below can carry an
 * explicit `BaseGuardian<EmbedFooterSchema>` annotation without a circular
 * reference — JSR's "slow types" check requires the originating declaration
 * of any type reachable from the public API to be explicit.
 */
export type EmbedFooterSchema = {
  /** Footer text. */
  text: string;
  /** URL of the footer icon (only supports http(s) and `attachment://`). */
  icon_url?: string;
  /** Response-only: Discord's proxied copy of `icon_url`. */
  proxy_icon_url?: string;
};

/** Schema for `embed.footer`. */
export const EmbedFooterSchemaObject: BaseGuardian<EmbedFooterSchema> = Guardian
  .object({
    /** Footer text. */
    text: Guardian.string().maxLength(EMBED_FOOTER_TEXT_MAX_LENGTH),
    /** URL of the footer icon (only supports http(s) and `attachment://`). */
    icon_url: Guardian.string().url().optional(),
    /** Response-only: Discord's proxied copy of `icon_url`. */
    proxy_icon_url: Guardian.string().url().optional(),
  }).passthrough().describe({
    title: 'Embed footer',
    description: 'The `footer` field of a Discord embed.',
  });

/** Type definition for `embed.image`/`embed.thumbnail`/`embed.video`. */
export type EmbedMediaSchema = {
  /** Source URL (only supports http(s) and `attachment://`). */
  url?: string;
  /** Response-only: Discord's proxied copy of `url`. */
  proxy_url?: string;
  /** Response-only: media height in pixels. */
  height?: number;
  /** Response-only: media width in pixels. */
  width?: number;
};

/** Schema shared by `embed.image`, `embed.thumbnail`, and `embed.video`. */
export const EmbedMediaSchemaObject: BaseGuardian<EmbedMediaSchema> = Guardian
  .object({
    /** Source URL (only supports http(s) and `attachment://`). */
    url: Guardian.string().url().optional(),
    /** Response-only: Discord's proxied copy of `url`. */
    proxy_url: Guardian.string().url().optional(),
    /** Response-only: media height in pixels. */
    height: Guardian.number().integer().optional(),
    /** Response-only: media width in pixels. */
    width: Guardian.number().integer().optional(),
  }).passthrough().describe({
    title: 'Embed media',
    description:
      "Shared shape of an embed's `image`/`thumbnail`/`video` fields.",
  });

/** Type definition for `embed.author`. */
export type EmbedAuthorSchema = {
  /** Author name. */
  name: string;
  /** URL the author name links to. */
  url?: string;
  /** URL of the author icon (only supports http(s) and `attachment://`). */
  icon_url?: string;
  /** Response-only: Discord's proxied copy of `icon_url`. */
  proxy_icon_url?: string;
};

/** Schema for `embed.author`. */
export const EmbedAuthorSchemaObject: BaseGuardian<EmbedAuthorSchema> = Guardian
  .object({
    /** Author name. */
    name: Guardian.string().maxLength(EMBED_AUTHOR_NAME_MAX_LENGTH),
    /** URL the author name links to. */
    url: Guardian.string().url().optional(),
    /** URL of the author icon (only supports http(s) and `attachment://`). */
    icon_url: Guardian.string().url().optional(),
    /** Response-only: Discord's proxied copy of `icon_url`. */
    proxy_icon_url: Guardian.string().url().optional(),
  }).passthrough().describe({
    title: 'Embed author',
    description: 'The `author` field of a Discord embed.',
  });

/** Type definition for one entry of `embed.fields`. */
export type EmbedFieldSchema = {
  /** Field name. */
  name: string;
  /** Field value. */
  value: string;
  /** Whether this field should render inline with its neighbors. */
  inline?: boolean;
};

/** Schema for one entry of `embed.fields`. */
export const EmbedFieldSchemaObject: BaseGuardian<EmbedFieldSchema> = Guardian
  .object({
    /** Field name. */
    name: Guardian.string().minLength(1).maxLength(
      EMBED_FIELD_NAME_MAX_LENGTH,
    ),
    /** Field value. */
    value: Guardian.string().minLength(1).maxLength(
      EMBED_FIELD_VALUE_MAX_LENGTH,
    ),
    /** Whether this field should render inline with its neighbors. */
    inline: Guardian.boolean().optional(),
  }).describe({
    title: 'Embed field',
    description: 'One entry of an embed`s `fields` array.',
  });

/**
 * Type definition for a Discord embed object.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * EmbedSchemaObject>`) so the exported schema below can carry an explicit
 * `BaseGuardian<EmbedSchema>` annotation without a circular reference —
 * JSR's "slow types" check requires the originating declaration of any type
 * reachable from the public API to be explicit.
 */
export type EmbedSchema = {
  /** Embed title. */
  title?: string;
  /** Response-only: embed type, almost always `'rich'` for a bot/webhook-authored embed. */
  type?: string;
  /** Embed description. */
  description?: string;
  /** URL the embed title links to. */
  url?: string;
  /** ISO 8601 timestamp rendered in the embed footer. */
  timestamp?: string;
  /** Left-hand accent color, as a 24-bit RGB integer (e.g. `0x5865f2`). */
  color?: number;
  /** Footer text/icon. */
  footer?: EmbedFooterSchema;
  /** Large image, rendered below the description. */
  image?: EmbedMediaSchema;
  /** Small image, rendered top-right. */
  thumbnail?: EmbedMediaSchema;
  /** Response-only: video attachment metadata. */
  video?: EmbedMediaSchema;
  /** Response-only: source metadata for an embed generated from a link. */
  provider?: {
    name?: string;
    url?: string;
  };
  /** Author name/URL/icon, rendered above the title. */
  author?: EmbedAuthorSchema;
  /** Up to {@link EMBED_MAX_FIELDS} name/value fields. */
  fields?: EmbedFieldSchema[];
};

/** Schema for a single Discord embed object. */
export const EmbedSchemaObject: BaseGuardian<EmbedSchema> = Guardian.object({
  /** Embed title. */
  title: Guardian.string().maxLength(EMBED_TITLE_MAX_LENGTH).optional(),
  /** Response-only: embed type, almost always `'rich'` for a bot/webhook-authored embed. */
  type: Guardian.string().optional(),
  /** Embed description. */
  description: Guardian.string().maxLength(EMBED_DESCRIPTION_MAX_LENGTH)
    .optional(),
  /** URL the embed title links to. */
  url: Guardian.string().url().optional(),
  /** ISO 8601 timestamp rendered in the embed footer. */
  timestamp: Guardian.string().optional(),
  /** Left-hand accent color, as a 24-bit RGB integer (e.g. `0x5865f2`). */
  color: Guardian.number().integer().min(0).max(EMBED_MAX_COLOR).optional(),
  /** Footer text/icon. */
  footer: EmbedFooterSchemaObject.optional(),
  /** Large image, rendered below the description. */
  image: EmbedMediaSchemaObject.optional(),
  /** Small image, rendered top-right. */
  thumbnail: EmbedMediaSchemaObject.optional(),
  /** Response-only: video attachment metadata. */
  video: EmbedMediaSchemaObject.optional(),
  /** Response-only: source metadata for an embed generated from a link. */
  provider: Guardian.object({
    name: Guardian.string().optional(),
    url: Guardian.string().url().optional(),
  }).passthrough().optional(),
  /** Author name/URL/icon, rendered above the title. */
  author: EmbedAuthorSchemaObject.optional(),
  /** Up to {@link EMBED_MAX_FIELDS} name/value fields. */
  fields: Guardian.array(EmbedFieldSchemaObject).maxLength(EMBED_MAX_FIELDS)
    .optional(),
}).passthrough().describe({
  title: 'Embed',
  description:
    'A Discord embed object, shared by webhook execution and channel message creation.',
});

/**
 * Whether `embeds` stays within Discord's documented combined character
 * budget ({@link EMBED_TOTAL_CHARACTER_LIMIT}) — the sum of every `title` +
 * `description` + `field.name` + `field.value` + `footer.text` +
 * `author.name`, across ALL embeds in the message.
 *
 * @param embeds - The `embeds` array of an outgoing message, if any.
 */
export function embedsWithinCharacterBudget(
  embeds: readonly EmbedSchema[] | undefined,
): boolean {
  if (!embeds || embeds.length === 0) return true;
  let total = 0;
  for (const embed of embeds) {
    total += embed.title?.length ?? 0;
    total += embed.description?.length ?? 0;
    total += embed.footer?.text?.length ?? 0;
    total += embed.author?.name?.length ?? 0;
    for (const field of embed.fields ?? []) {
      total += field.name.length + field.value.length;
    }
  }
  return total <= EMBED_TOTAL_CHARACTER_LIMIT;
}
