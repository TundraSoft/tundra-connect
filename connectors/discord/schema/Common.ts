import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Reusable Guardian validation components shared by the Discord request and
 * response schemas.
 *
 * @example
 * ```typescript
 * import { snowflakeGuard } from '@tundraconnect/discord/schemas';
 *
 * const [error, channelId] = snowflakeGuard.safeParse('123456789012345678');
 * if (!error) {
 *   console.log('Valid snowflake:', channelId);
 * }
 * ```
 */

/** Discord snowflake ID: a 17-20 digit numeric string. */
export const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

/**
 * Execute-webhook URL, as copied from a channel's Integrations settings:
 * `https://discord.com/api[/vN]/webhooks/{webhook.id}/{webhook.token}`.
 * Captures `(id, token)` so callers only holding a full URL can still
 * build the `/webhooks/{id}/{token}` request path without re-parsing it.
 */
export const WEBHOOK_URL_PATTERN =
  /^https:\/\/discord\.com\/api(?:\/v\d{1,2})?\/webhooks\/(\d{17,20})\/([^/?#]+)\/?$/;

/** Type definition for a validated Discord snowflake ID. */
export type SnowflakeSchema = string;

/** Validates a Discord snowflake ID (17-20 digit numeric string). */
export const snowflakeGuard: BaseGuardian<SnowflakeSchema> = Guardian.string()
  .pattern(
    SNOWFLAKE_PATTERN,
    'Discord snowflake IDs are 17-20 digit numeric strings',
  ).describe({
    title: 'Discord snowflake ID',
    description:
      'A Discord-assigned unique identifier (channel, message, webhook, user, etc.), encoded as a numeric string.',
  });

/**
 * Webhook token supplied on its own (id + token mode): exactly one URL
 * path segment — no `/`, `?`, or `#` (the characters that would splice
 * extra path segments or a query/fragment into the request URL), and not
 * the relative segments `.` or `..` (which path normalization would fold
 * away, silently retargeting the request). The character class mirrors
 * exactly what {@link WEBHOOK_URL_PATTERN} enforces on the token portion
 * of a full webhook URL, so both configuration modes accept the same
 * values.
 */
export const WEBHOOK_TOKEN_PATTERN = /^(?!\.\.?$)[^/?#]+$/;

/** Validates a webhook token supplied on its own (id + token mode). */
export const webhookTokenGuard: BaseGuardian<string> = Guardian.string()
  .pattern(
    WEBHOOK_TOKEN_PATTERN,
    "Webhook token must be a single URL path segment: no '/', '?', or '#', and not '.' or '..'",
  ).describe({
    title: 'Discord webhook token',
    description:
      "The token portion of a webhook's URL, issued by Discord alongside the webhook's ID.",
  });

/** Validates a full Discord execute-webhook URL. */
export const webhookUrlGuard: BaseGuardian<string> = Guardian.string()
  .pattern(
    WEBHOOK_URL_PATTERN,
    "Webhook URL must match 'https://discord.com/api[/vN]/webhooks/{webhook.id}/{webhook.token}'",
  ).describe({
    title: 'Discord webhook URL',
    description:
      "Full execute-webhook URL, as copied from a channel's Integrations settings.",
  });

/**
 * Splits a validated webhook URL into its `{webhook.id}/{webhook.token}`
 * parts, so the client can build the `/webhooks/{id}/{token}` request path
 * without asking the caller to supply them separately.
 *
 * @param url - A webhook URL, expected to already match {@link WEBHOOK_URL_PATTERN}.
 * @returns The `{ id, token }` pair, or `undefined` if `url` doesn't match.
 */
export function parseWebhookUrl(
  url: string,
): { id: string; token: string } | undefined {
  const match = WEBHOOK_URL_PATTERN.exec(url);
  if (!match?.[1] || !match?.[2]) return undefined;
  return { id: match[1], token: match[2] };
}

/** Documented `allowed_mentions.parse` values. */
export const ALLOWED_MENTION_PARSE_TYPES = [
  'roles',
  'users',
  'everyone',
] as const;

/**
 * Type definition for the `allowed_mentions` object.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * AllowedMentionsSchemaObject>`) so the exported schema below can carry an
 * explicit `BaseGuardian<AllowedMentionsSchema>` annotation without a
 * circular reference — JSR's "slow types" check requires the originating
 * declaration of any type reachable from the public API to be explicit.
 */
export type AllowedMentionsSchema = {
  /** Mention types allowed to notify, parsed from `content`. */
  parse?: (typeof ALLOWED_MENTION_PARSE_TYPES)[number][];
  /** Role IDs allowed to be mentioned (max 100). Mutually exclusive with `parse: ['roles']`. */
  roles?: SnowflakeSchema[];
  /** User IDs allowed to be mentioned (max 100). Mutually exclusive with `parse: ['users']`. */
  users?: SnowflakeSchema[];
  /** Whether to mention the author of a replied-to message. */
  replied_user?: boolean;
};

/**
 * Schema for the `allowed_mentions` object, shared by webhook execution and
 * channel message creation. Controls which mentions in `content` actually
 * notify someone, independent of what the raw text contains.
 */
export const AllowedMentionsSchemaObject: BaseGuardian<AllowedMentionsSchema> =
  Guardian.object({
    /** Mention types allowed to notify, parsed from `content`. */
    parse: Guardian.array(Guardian.enum(ALLOWED_MENTION_PARSE_TYPES))
      .optional(),
    /** Role IDs allowed to be mentioned (max 100). Mutually exclusive with `parse: ['roles']`. */
    roles: Guardian.array(snowflakeGuard).maxLength(100).optional(),
    /** User IDs allowed to be mentioned (max 100). Mutually exclusive with `parse: ['users']`. */
    users: Guardian.array(snowflakeGuard).maxLength(100).optional(),
    /** Whether to mention the author of a replied-to message. */
    replied_user: Guardian.boolean().optional(),
  }).describe({
    title: 'Allowed mentions',
    description:
      'Controls which mentions in `content` are actually notified, overriding the raw text.',
  });
