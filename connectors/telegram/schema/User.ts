import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Schema for a Telegram `User` object.
 *
 * Telegram documents a single `User` type shared by two very different
 * contexts: a message's sender (`Message.from`) and the bot's own identity
 * (the `result` of `getMe`, which additionally carries bot-capability
 * flags such as `can_join_groups`). This models the commonly-used subset
 * of both; `.passthrough()` keeps any additional documented field
 * (`is_premium`, business-account flags, …) reachable at runtime without a
 * schema update.
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived): JSR's
 * public-API "slow types" check requires the *originating* declaration of
 * any type reachable from the public API to carry an explicit annotation,
 * including a private, unexported `const` reached only via `typeof` — so
 * the shape is pinned directly here instead of threaded through an
 * internal helper (mirrors `stripe/schema/Customer.ts`'s `AddressSchema`).
 *
 * @example
 * ```typescript
 * import { UserSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, bot] = UserSchemaObject.safeParse({
 *   id: 123456789,
 *   is_bot: true,
 *   first_name: 'ExampleBot',
 *   username: 'example_bot',
 *   can_join_groups: true,
 *   can_read_all_group_messages: false,
 *   supports_inline_queries: false,
 * });
 * if (!error) {
 *   console.log(bot.username);
 * }
 * ```
 */
export type UserSchema = {
  /** Unique Telegram identifier for this user or bot. */
  id: number;
  /** Whether this user is a bot. */
  is_bot: boolean;
  /** First name (or the bot's display name). */
  first_name: string;
  /** Last name, when set. */
  last_name?: string;
  /** `@username`, without the leading `@`, when set. */
  username?: string;
  /** IETF language tag of the user's Telegram client, when known. */
  language_code?: string;
  /** Whether the user has a Telegram Premium subscription. */
  is_premium?: boolean;
  /** Whether the user added the bot to their attachment menu. */
  added_to_attachment_menu?: boolean;
  /** `getMe` only: whether the bot can be invited to groups. */
  can_join_groups?: boolean;
  /** `getMe` only: whether privacy mode is disabled, so the bot sees every group message. */
  can_read_all_group_messages?: boolean;
  /** `getMe` only: whether the bot supports inline queries. */
  supports_inline_queries?: boolean;
  /** `getMe` only: whether the bot can be connected to a Telegram Business account. */
  can_connect_to_business?: boolean;
  /** `getMe` only: whether the bot has a main Web App. */
  has_main_web_app?: boolean;
};

/** A Telegram user or bot, as returned in a message's `from` field or by `getMe`. */
export const UserSchemaObject: BaseGuardian<UserSchema> = Guardian.object({
  id: Guardian.number().integer(),
  is_bot: Guardian.boolean(),
  first_name: Guardian.string(),
  last_name: Guardian.string().optional(),
  username: Guardian.string().optional(),
  language_code: Guardian.string().optional(),
  is_premium: Guardian.boolean().optional(),
  added_to_attachment_menu: Guardian.boolean().optional(),
  can_join_groups: Guardian.boolean().optional(),
  can_read_all_group_messages: Guardian.boolean().optional(),
  supports_inline_queries: Guardian.boolean().optional(),
  can_connect_to_business: Guardian.boolean().optional(),
  has_main_web_app: Guardian.boolean().optional(),
}).passthrough().describe({
  title: 'User',
  description:
    "A Telegram user or bot, as returned in a message's `from` field or by `getMe`.",
});
