import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Schema for the subset of a Slack user's `profile` object this connect
 * models. Slack's full profile carries dozens of workspace/Enterprise Grid
 * fields (custom fields, Kerberos identities, multiple avatar sizes, ...)
 * — `.passthrough()` keeps the rest reachable at runtime without a schema
 * update.
 */
export type SlackUserProfileSchema = {
  /** The user's email address, when the token's scopes permit reading it. */
  email?: string;
  /** URL of the user's 192x192 avatar. */
  image_192?: string;
  /** The user's custom status text. */
  status_text?: string;
};

/** Schema for the subset of a Slack user's `profile` object this connect models. */
export const SlackUserProfileSchemaObject: BaseGuardian<
  SlackUserProfileSchema
> = Guardian.object({
  email: Guardian.string().optional(),
  image_192: Guardian.string().optional(),
  status_text: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Slack user profile (partial)',
  description: "Subset of a Slack user's profile fields.",
});

/**
 * Schema for a Slack user resource, as returned by `users.info`.
 *
 * Slack documents many more fields (`tz`, `is_admin`, `is_owner`, locale
 * flags, ...) — this models the commonly-used identity subset;
 * `.passthrough()` keeps the rest reachable at runtime without a schema
 * update.
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived) for the
 * same JSR "slow types" reason documented on
 * `connectors/slack/schema/Message.ts`'s `MessageSchema`.
 *
 * @example
 * ```typescript
 * import { SlackUserSchemaObject } from '@tundraconnect/slack/schemas';
 *
 * const [error, user] = SlackUserSchemaObject.safeParse({
 *   id: 'U123ABC456',
 *   team_id: 'T123ABC',
 *   name: 'ada',
 *   real_name: 'Ada Lovelace',
 *   is_bot: false,
 * });
 * if (!error) {
 *   console.log(user.name);
 * }
 * ```
 */
export type SlackUserSchema = {
  /** The user's unique id. */
  id: string;
  /** The id of the workspace this user belongs to. */
  team_id?: string;
  /** The user's username. */
  name: string;
  /** The user's full display name, when set. */
  real_name?: string;
  /** Whether this user is a bot user. */
  is_bot?: boolean;
  /** Profile fields, including avatar/contact/status info. */
  profile?: SlackUserProfileSchema;
};

/** Schema for a Slack user resource. */
export const SlackUserSchemaObject: BaseGuardian<SlackUserSchema> = Guardian
  .object({
    id: Guardian.string(),
    team_id: Guardian.string().optional(),
    name: Guardian.string(),
    real_name: Guardian.string().optional(),
    is_bot: Guardian.boolean().optional(),
    profile: SlackUserProfileSchemaObject.optional(),
  }).passthrough().describe({
    title: 'User',
    description: 'A Slack user resource, as returned by users.info.',
  });
