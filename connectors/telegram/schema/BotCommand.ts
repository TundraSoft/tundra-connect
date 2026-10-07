import { type BaseGuardian, Guardian, type ObjectGuardian } from '@guardian';
import { chatIdGuard, type ChatIdSchema } from './Common.ts';

/**
 * The bot's command menu: `setMyCommands`, `getMyCommands` and
 * `deleteMyCommands`, each optionally narrowed to a {@link BotCommandScopeSchema}
 * and a language.
 *
 * @example
 * ```typescript
 * import { SetMyCommandsRequestSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, request] = SetMyCommandsRequestSchemaObject.safeParse({
 *   commands: [{ command: 'status', description: 'Service status' }],
 *   scope: { type: 'all_private_chats' },
 * });
 * if (!error) {
 *   console.log(request.commands.length);
 * }
 * ```
 */

/** A command name: 1-32 lowercase English letters, digits and underscores. */
const BOT_COMMAND_PATTERN = /^[a-z0-9_]{1,32}$/;

/** A two-letter ISO 639-1 language code, or `''` for "all languages". */
const LANGUAGE_CODE_PATTERN = /^(?:[a-z]{2})?$/;

/** Maximum number of commands `setMyCommands` accepts. */
export const MAX_BOT_COMMANDS = 100;

/**
 * Schema for a `BotCommand`, one entry of the bot's command menu.
 *
 * `command` is written without the leading `/`. Telegram allows only
 * lowercase letters, digits and underscores there; users may still TYPE
 * `/Status`, which is why `Telegram.parseCommand` lowercases what it
 * parses.
 *
 * @example
 * ```typescript
 * import { BotCommandSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * BotCommandSchemaObject.parse({
 *   command: 'today',
 *   description: "Today's link and click totals",
 * });
 * ```
 */
export type BotCommandSchema = {
  /** Command name without the `/`; 1-32 of `a-z`, `0-9` and `_`. */
  command: string;
  /** Description shown in the menu; 1-256 characters. */
  description: string;
  /** Whether the command sends an ephemeral message, seen only by the sender. */
  is_ephemeral?: boolean;
};

/** One entry of the bot's command menu, as sent to `setMyCommands`. */
export const BotCommandSchemaObject: BaseGuardian<BotCommandSchema> = Guardian
  .object({
    command: Guardian.string().pattern(
      BOT_COMMAND_PATTERN,
      'command must be 1-32 lowercase letters, digits or underscores, without the leading /',
    ),
    description: Guardian.string().minLength(1).maxLength(256),
    is_ephemeral: Guardian.boolean().strict().optional(),
  }).strict().describe({
    title: 'Bot command',
    description: "One entry of the bot's command menu.",
  });

/**
 * The commands `getMyCommands` returns. Validated leniently (no pattern or
 * length checks, unknown fields kept), since it describes what Telegram
 * has stored rather than what this package is about to send.
 *
 * @example
 * ```typescript
 * import { BotCommandListSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * BotCommandListSchemaObject.parse([{ command: 'help', description: 'Help' }]);
 * ```
 */
export const BotCommandListSchemaObject: BaseGuardian<BotCommandSchema[]> =
  Guardian.array(
    Guardian.object({
      command: Guardian.string(),
      description: Guardian.string(),
      is_ephemeral: Guardian.boolean().optional(),
    }).passthrough(),
  ).describe({
    title: 'Bot command list',
    description: 'The commands `getMyCommands` returns.',
  });

/** Scope `default`: every user without a narrower scope. */
export type BotCommandScopeDefaultSchema = { type: 'default' };
/** Scope `all_private_chats`: every private chat. */
export type BotCommandScopeAllPrivateChatsSchema = {
  type: 'all_private_chats';
};
/** Scope `all_group_chats`: every group and supergroup chat. */
export type BotCommandScopeAllGroupChatsSchema = { type: 'all_group_chats' };
/** Scope `all_chat_administrators`: administrators of every group and supergroup. */
export type BotCommandScopeAllChatAdministratorsSchema = {
  type: 'all_chat_administrators';
};
/** Scope `chat`: one specific chat. */
export type BotCommandScopeChatSchema = {
  type: 'chat';
  /** Target chat id, or `@username` of a supergroup. */
  chat_id: ChatIdSchema;
};
/** Scope `chat_administrators`: administrators of one specific group or supergroup. */
export type BotCommandScopeChatAdministratorsSchema = {
  type: 'chat_administrators';
  /** Target chat id, or `@username` of a supergroup. */
  chat_id: ChatIdSchema;
};
/** Scope `chat_member`: one member of one specific group or supergroup. */
export type BotCommandScopeChatMemberSchema = {
  type: 'chat_member';
  /** Target chat id, or `@username` of a supergroup. */
  chat_id: ChatIdSchema;
  /** Target user id. */
  user_id: number;
};

/**
 * Validates scope `default`. Each scope branch is typed `ObjectGuardian`
 * (rather than `BaseGuardian`) because `Guardian.discriminatedUnion(...)`
 * reads each branch's `type` literal at construction time.
 */
export const BotCommandScopeDefaultSchemaObject: ObjectGuardian<
  BotCommandScopeDefaultSchema
> = Guardian.object({ type: Guardian.literal('default') }).strict();

/** Validates scope `all_private_chats`. */
export const BotCommandScopeAllPrivateChatsSchemaObject: ObjectGuardian<
  BotCommandScopeAllPrivateChatsSchema
> = Guardian.object({ type: Guardian.literal('all_private_chats') }).strict();

/** Validates scope `all_group_chats`. */
export const BotCommandScopeAllGroupChatsSchemaObject: ObjectGuardian<
  BotCommandScopeAllGroupChatsSchema
> = Guardian.object({ type: Guardian.literal('all_group_chats') }).strict();

/** Validates scope `all_chat_administrators`. */
export const BotCommandScopeAllChatAdministratorsSchemaObject: ObjectGuardian<
  BotCommandScopeAllChatAdministratorsSchema
> = Guardian.object({
  type: Guardian.literal('all_chat_administrators'),
}).strict();

/** Validates scope `chat`. */
export const BotCommandScopeChatSchemaObject: ObjectGuardian<
  BotCommandScopeChatSchema
> = Guardian.object({
  type: Guardian.literal('chat'),
  chat_id: chatIdGuard,
}).strict();

/** Validates scope `chat_administrators`. */
export const BotCommandScopeChatAdministratorsSchemaObject: ObjectGuardian<
  BotCommandScopeChatAdministratorsSchema
> = Guardian.object({
  type: Guardian.literal('chat_administrators'),
  chat_id: chatIdGuard,
}).strict();

/** Validates scope `chat_member`. */
export const BotCommandScopeChatMemberSchemaObject: ObjectGuardian<
  BotCommandScopeChatMemberSchema
> = Guardian.object({
  type: Guardian.literal('chat_member'),
  chat_id: chatIdGuard,
  user_id: Guardian.number().integer().strict(),
}).strict();

/**
 * Which users a command list applies to. Telegram picks the narrowest
 * scope that matches a user: `chat_member`, then `chat_administrators`,
 * `chat`, `all_chat_administrators`, `all_group_chats` /
 * `all_private_chats`, and finally `default`.
 */
export type BotCommandScopeSchema =
  | BotCommandScopeDefaultSchema
  | BotCommandScopeAllPrivateChatsSchema
  | BotCommandScopeAllGroupChatsSchema
  | BotCommandScopeAllChatAdministratorsSchema
  | BotCommandScopeChatSchema
  | BotCommandScopeChatAdministratorsSchema
  | BotCommandScopeChatMemberSchema;

/**
 * Validates a `BotCommandScope`, discriminated on `type`.
 *
 * @example
 * ```typescript
 * import { BotCommandScopeSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * BotCommandScopeSchemaObject.parse({
 *   type: 'chat_administrators',
 *   chat_id: -1001234567890,
 * });
 * ```
 */
export const BotCommandScopeSchemaObject: BaseGuardian<BotCommandScopeSchema> =
  Guardian.discriminatedUnion('type', [
    BotCommandScopeDefaultSchemaObject,
    BotCommandScopeAllPrivateChatsSchemaObject,
    BotCommandScopeAllGroupChatsSchemaObject,
    BotCommandScopeAllChatAdministratorsSchemaObject,
    BotCommandScopeChatSchemaObject,
    BotCommandScopeChatAdministratorsSchemaObject,
    BotCommandScopeChatMemberSchemaObject,
  ]).describe({
    title: 'Bot command scope',
    description: 'Which users a command list applies to.',
  });

/** Request schema for `POST /setMyCommands`. */
export type SetMyCommandsRequestSchema = {
  /** The command list; at most 100 commands. */
  commands: BotCommandSchema[];
  /** Users the list applies to; Telegram defaults to `{ type: 'default' }`. */
  scope?: BotCommandScopeSchema;
  /**
   * Two-letter ISO 639-1 code. When empty or omitted, the list applies to
   * every user in the scope without a dedicated list for their language.
   */
  language_code?: string;
};

/**
 * Request body validated before POST /setMyCommands.
 *
 * @example
 * ```typescript
 * import { SetMyCommandsRequestSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * SetMyCommandsRequestSchemaObject.parse({
 *   commands: [{ command: 'help', description: 'What this bot can do' }],
 * });
 * ```
 */
export const SetMyCommandsRequestSchemaObject: BaseGuardian<
  SetMyCommandsRequestSchema
> = Guardian.object({
  commands: Guardian.array(BotCommandSchemaObject).maxLength(
    MAX_BOT_COMMANDS,
  ),
  scope: BotCommandScopeSchemaObject.optional(),
  language_code: Guardian.string().pattern(
    LANGUAGE_CODE_PATTERN,
    'language_code must be a two-letter ISO 639-1 code (or empty)',
  ).optional(),
}).strict().describe({
  title: 'setMyCommands request',
  description: 'Request body validated before POST /setMyCommands.',
});

/** Request schema for `POST /getMyCommands` (and `POST /deleteMyCommands`). */
export type GetMyCommandsRequestSchema = {
  /** Users to read the list for; Telegram defaults to `{ type: 'default' }`. */
  scope?: BotCommandScopeSchema;
  /** Two-letter ISO 639-1 code, or empty. */
  language_code?: string;
};

/**
 * Request body validated before POST /getMyCommands.
 *
 * @example
 * ```typescript
 * import { GetMyCommandsRequestSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * GetMyCommandsRequestSchemaObject.parse({ scope: { type: 'all_group_chats' } });
 * ```
 */
export const GetMyCommandsRequestSchemaObject: BaseGuardian<
  GetMyCommandsRequestSchema
> = Guardian.object({
  scope: BotCommandScopeSchemaObject.optional(),
  language_code: Guardian.string().pattern(
    LANGUAGE_CODE_PATTERN,
    'language_code must be a two-letter ISO 639-1 code (or empty)',
  ).optional(),
}).strict().describe({
  title: 'getMyCommands request',
  description: 'Request body validated before POST /getMyCommands.',
});

/** Request schema for `POST /deleteMyCommands`; same shape as {@link GetMyCommandsRequestSchema}. */
export type DeleteMyCommandsRequestSchema = GetMyCommandsRequestSchema;

/**
 * Request body validated before POST /deleteMyCommands. After deletion,
 * users in the scope see the next broader scope's commands.
 *
 * @example
 * ```typescript
 * import { DeleteMyCommandsRequestSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * DeleteMyCommandsRequestSchemaObject.parse({ language_code: 'de' });
 * ```
 */
export const DeleteMyCommandsRequestSchemaObject: BaseGuardian<
  DeleteMyCommandsRequestSchema
> = GetMyCommandsRequestSchemaObject;
