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

/**
 * Documented `Chat.type` values. {@link ChatSchemaObject} accepts any string
 * there, so compare against these rather than relying on the type to
 * narrow.
 */
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
  /**
   * Chat type: one of {@link CHAT_TYPES}, or a type added by Telegram after
   * this package was published. Typed as `string` for the same reason as
   * `MessageEntity.type`: a chat arrives inside every webhook update, and an
   * unknown type must not make the whole update fail to parse.
   */
  type: string;
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
  type: Guardian.string(),
  title: Guardian.string().optional(),
  username: Guardian.string().optional(),
  first_name: Guardian.string().optional(),
  last_name: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Chat',
  description: 'The chat a Telegram message belongs to.',
});

/**
 * Documented `MessageEntity.type` values at the time of writing.
 *
 * {@link MessageEntitySchemaObject} deliberately accepts ANY string as
 * `type`, not just these: entities arrive inside webhook updates, and a
 * type Telegram adds later must not make a whole update fail to parse.
 * Compare against this list when you need to know whether a type is one
 * this package knows about.
 */
export const MESSAGE_ENTITY_TYPES = [
  'mention',
  'hashtag',
  'cashtag',
  'bot_command',
  'url',
  'email',
  'phone_number',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'spoiler',
  'blockquote',
  'expandable_blockquote',
  'code',
  'pre',
  'text_link',
  'text_mention',
  'custom_emoji',
  'date_time',
] as const;

/**
 * Schema for a Telegram `MessageEntity` — one formatted or special span
 * of a message's text (a `/command`, a URL, bold text, …).
 *
 * `offset` and `length` count UTF-16 code units, the same unit a
 * JavaScript string's `.length` and `.slice()` use, so
 * `text.slice(offset, offset + length)` extracts the entity's text
 * directly.
 *
 * @example
 * ```typescript
 * import { MessageEntitySchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, entity] = MessageEntitySchemaObject.safeParse({
 *   type: 'bot_command',
 *   offset: 0,
 *   length: 6,
 * });
 * if (!error) {
 *   console.log(entity.type);
 * }
 * ```
 */
export type MessageEntitySchema = {
  /**
   * Entity type: one of {@link MESSAGE_ENTITY_TYPES}, or a type added by
   * Telegram after this package was published.
   */
  type: string;
  /** Offset in UTF-16 code units to the start of the entity. */
  offset: number;
  /** Length of the entity in UTF-16 code units. */
  length: number;
  /** For `text_link` only: the URL opened when the text is tapped. */
  url?: string;
  /** For `text_mention` only: the mentioned user. */
  user?: UserSchema;
  /** For `pre` only: the programming language of the entity text. */
  language?: string;
  /** For `custom_emoji` only: the custom emoji's identifier. */
  custom_emoji_id?: string;
  /** For `date_time` only: the Unix time associated with the entity. */
  unix_time?: number;
  /** For `date_time` only: the date-time formatting string. */
  date_time_format?: string;
};

/** One special entity in a message's text. */
export const MessageEntitySchemaObject: BaseGuardian<MessageEntitySchema> =
  Guardian.object({
    type: Guardian.string().minLength(1),
    offset: Guardian.number().integer().min(0),
    length: Guardian.number().integer().min(0),
    url: Guardian.string().optional(),
    user: UserSchemaObject.optional(),
    language: Guardian.string().optional(),
    custom_emoji_id: Guardian.string().optional(),
    unix_time: Guardian.number().integer().optional(),
    date_time_format: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'Message entity',
    description: "One special entity in a message's text.",
  });

/**
 * Schema for a Telegram `Message` object.
 *
 * Telegram documents 100+ optional fields covering every message type
 * (photos, polls, service messages, …) — this models the subset a
 * text-message bot uses: the sender, the chat, the text and its
 * entities (where a `/command` is marked), and the group-migration
 * service fields. `.passthrough()` keeps the rest reachable without a
 * schema update.
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
  /**
   * Unique message identifier inside this chat. Telegram documents `0` for
   * ephemeral messages and for a message the server scheduled instead of
   * sending immediately.
   */
  message_id: number;
  /** Unix timestamp (seconds) the message was sent. */
  date: number;
  /** Chat the message belongs to. */
  chat: ChatSchema;
  /** Sender; absent for messages posted to channels anonymously. */
  from?: UserSchema;
  /** Sender when the message was sent on behalf of a chat. */
  sender_chat?: ChatSchema;
  /** Forum topic (message thread) the message belongs to. */
  message_thread_id?: number;
  /** Unix timestamp (seconds) the message was last edited. */
  edit_date?: number;
  /** Message text, for text messages. */
  text?: string;
  /** Special entities in `text`: commands, URLs, formatting, … */
  entities?: MessageEntitySchema[];
  /**
   * Service message: this group was migrated to a supergroup with this
   * id. Send to the new id from now on.
   */
  migrate_to_chat_id?: number;
  /** Service message: this supergroup was migrated from the group with this id. */
  migrate_from_chat_id?: number;
};

/** A Telegram message, as returned by `sendMessage` or received in an update. */
export const MessageSchemaObject: BaseGuardian<MessageSchema> = Guardian
  .object({
    message_id: Guardian.number().integer(),
    date: Guardian.number().integer(),
    chat: ChatSchemaObject,
    from: UserSchemaObject.optional(),
    sender_chat: ChatSchemaObject.optional(),
    message_thread_id: Guardian.number().integer().optional(),
    edit_date: Guardian.number().integer().optional(),
    text: Guardian.string().optional(),
    entities: Guardian.array(MessageEntitySchemaObject).optional(),
    migrate_to_chat_id: Guardian.number().integer().optional(),
    migrate_from_chat_id: Guardian.number().integer().optional(),
  }).passthrough().describe({
    title: 'Message',
    description:
      'A Telegram message, as returned by `sendMessage` or received in an update.',
  });

/** Type of the bare `true` many Bot API methods return on success. */
export type TrueResultSchema = true;

/**
 * The bare `true` that `setWebhook`, `deleteWebhook`, `setMyCommands`,
 * `deleteMyCommands`, `answerCallbackQuery` and `deleteMessage` return as
 * their `result`.
 *
 * @example
 * ```typescript
 * import { TrueResultSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * TrueResultSchemaObject.parse(true); // true
 * ```
 */
export const TrueResultSchemaObject: BaseGuardian<TrueResultSchema> = Guardian
  .literal(true).describe({
    title: 'True result',
    description: 'The bare `true` many Bot API methods return on success.',
  });
