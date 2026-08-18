import { type BaseGuardian, Guardian } from '@guardian';
import { type UserSchema, UserSchemaObject } from './User.ts';

/**
 * Shared Guardian components for the Telegram Bot API: the bot token shape,
 * the `chat_id` union every send-style method accepts, and the
 * `Chat`/`Message` response pieces those methods return.
 *
 * Every exported schema below carries an explicit `BaseGuardian<T>`
 * annotation with a hand-written `T` (rather than relying on
 * `GuardianInfer<typeof someGuard>` off an unannotated symbol). JSR's
 * public-API "slow types" check requires the *originating* declaration of
 * any type reachable from the public API to be explicit — including a
 * private, unexported `const` referenced only via `typeof` — so inference
 * has to be pinned right here rather than threaded through an internal
 * helper (mirrors `stripe/schema/Common.ts` / `stripe/schema/Customer.ts`).
 *
 * @example
 * ```typescript
 * import { chatIdGuard, MessageSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * chatIdGuard.parse('@examplechannel'); // '@examplechannel'
 * chatIdGuard.parse(123456789);          // 123456789
 * ```
 */

/** Documented `Chat.type` values. */
export const CHAT_TYPES = [
  'private',
  'group',
  'supergroup',
  'channel',
] as const;

/**
 * Bot token issued by [@BotFather](https://t.me/BotFather):
 * `<numeric bot id>:<secret>`, e.g.
 * `123456789:AAExampleTokenAABBCCDDEEFFGGHHIIJJKKLLMM`. Telegram's own docs
 * don't publish a fixed length or a formally-specified character set for
 * the secret portion (their example, `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`,
 * only shows it's letters/digits/hyphens), so only the stable
 * `<digits>:<non-empty tail>` structure is pinned here — permissive enough
 * to not reject a legitimately-issued token, strict enough to catch the
 * cases that actually matter (empty, no colon, a pasted URL, embedded
 * whitespace/newlines from a copy-paste mistake).
 */
const BOT_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]+$/;

/** Type definition for a validated `chat_id`. */
export type ChatIdSchema = number | string;

/**
 * Validates a `chat_id` — Telegram accepts either the chat's integer id or,
 * for a public channel/supergroup, an `@username` string.
 *
 * The number branch uses `.strict()` to opt out of `NumberGuardian`'s
 * default coercion: without it, `oneOf` (which tries its guards in order)
 * would let a purely-numeric string like `'123456789'` resolve through the
 * number branch first, silently normalizing it and defeating the union's
 * intent of preserving which shape the caller actually passed. With
 * `.strict()`, a numeric-looking string correctly fails the number branch
 * and falls through to match the string branch instead (mirrors
 * `openweathermap/schema/Common.ts`'s `codGuard`, which has the same
 * number-or-string shape).
 *
 * The string branch can't just be `Guardian.string().minLength(1)`, though:
 * unlike `NumberGuardian`/`BooleanGuardian`, `StringGuardian` has no
 * `.strict()` of its own — it always coerces a number/boolean to its
 * string form. Without a guard, a rejected number-branch input like
 * `123.45` or `true` would fall through and get silently stringified to
 * `'123.45'` / `'true'` instead of being rejected. `Guardian.unknown().test()`
 * here only inspects `typeof` (no coercion), so it fills that gap the same
 * way the number branch's `.strict()` does for its own type.
 */
export const chatIdGuard: BaseGuardian<ChatIdSchema> = Guardian.oneOf(
  [
    Guardian.number().integer().strict(),
    Guardian.unknown<string>().test(
      (value) => typeof value === 'string' && value.length > 0,
      "chat_id must be an integer chat id or a non-empty string (e.g. '@channelusername')",
    ),
  ],
  "chat_id must be an integer chat id or a non-empty string (e.g. '@channelusername')",
)
  .describe({
    title: 'Chat id',
    description:
      "A chat's integer id, or an `@username` string for a public channel/supergroup.",
  });

/** Type definition for a validated Telegram bot token. */
export type BotTokenSchema = string;

/** Validates a Telegram bot token issued by @BotFather. */
export const botTokenGuard: BaseGuardian<BotTokenSchema> = Guardian.string()
  .pattern(
    BOT_TOKEN_PATTERN,
    "Bot token must match '<numeric bot id>:<secret>' (issued by @BotFather)",
  ).describe({
    title: 'Telegram bot token',
    description:
      'Bot token issued by @BotFather: a numeric bot id, a colon, then the secret portion.',
  });

/**
 * Schema for a Telegram `Chat` object.
 *
 * Telegram documents dozens of group/channel-specific fields (`photo`,
 * `permissions`, `invite_link`, …) — this models the commonly-used
 * identity subset; `.passthrough()` keeps the rest reachable at runtime
 * without a schema update.
 *
 * @example
 * ```typescript
 * import { ChatSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, chat] = ChatSchemaObject.safeParse({
 *   id: 123456789,
 *   type: 'private',
 *   first_name: 'Ada',
 * });
 * if (!error) {
 *   console.log(chat.type);
 * }
 * ```
 */
export type ChatSchema = {
  /** Unique chat identifier; may exceed 32 significant bits. */
  id: number;
  /** Chat type. */
  type: (typeof CHAT_TYPES)[number];
  /** Title, for supergroups, channels, and group chats. */
  title?: string;
  /** `@username`, for private chats, supergroups, and channels, when public. */
  username?: string;
  /** First name of the other party, for a private chat. */
  first_name?: string;
  /** Last name of the other party, for a private chat. */
  last_name?: string;
};

/** The chat a Telegram message belongs to. */
export const ChatSchemaObject: BaseGuardian<ChatSchema> = Guardian.object({
  id: Guardian.number().integer(),
  type: Guardian.enum(CHAT_TYPES),
  title: Guardian.string().optional(),
  username: Guardian.string().optional(),
  first_name: Guardian.string().optional(),
  last_name: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Chat',
  description: 'The chat a Telegram message belongs to.',
});

/**
 * Schema for a Telegram `Message` object.
 *
 * Telegram documents 100+ optional fields covering every message type
 * (photos, polls, service messages, …) — this models the subset a
 * text-message send flow (`sendMessage`'s response) actually uses;
 * `.passthrough()` keeps the rest reachable without a schema update.
 *
 * @example
 * ```typescript
 * import { MessageSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, message] = MessageSchemaObject.safeParse({
 *   message_id: 1,
 *   date: 1735689600,
 *   chat: { id: 123456789, type: 'private', first_name: 'Ada' },
 *   text: 'Hello!',
 * });
 * if (!error) {
 *   console.log(message.message_id);
 * }
 * ```
 */
export type MessageSchema = {
  /** Unique message identifier inside this chat. */
  message_id: number;
  /** Unix timestamp (seconds) the message was sent. */
  date: number;
  /** Chat the message belongs to. */
  chat: ChatSchema;
  /** Sender; absent for messages posted to channels anonymously. */
  from?: UserSchema;
  /** Message text, for text messages. */
  text?: string;
};

/** A Telegram message, as returned by `sendMessage`. */
export const MessageSchemaObject: BaseGuardian<MessageSchema> = Guardian
  .object({
    message_id: Guardian.number().integer(),
    date: Guardian.number().integer(),
    chat: ChatSchemaObject,
    from: UserSchemaObject.optional(),
    text: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'Message',
    description: 'A Telegram message, as returned by `sendMessage`.',
  });
