import { type BaseGuardian, Guardian } from '@guardian';
import {
  type ChatSchema,
  ChatSchemaObject,
  type MessageSchema,
  MessageSchemaObject,
} from './Common.ts';
import { type UserSchema, UserSchemaObject } from './User.ts';

/**
 * What a webhook receives: one `Update` per request.
 *
 * Every schema here is a RESPONSE-side schema and uses `.passthrough()`:
 * Telegram adds update kinds and fields over time, and a webhook must not
 * start rejecting updates because of that. An update of a kind this
 * package does not model (`poll`, `message_reaction`, …) still parses; its
 * payload stays reachable as an untyped property.
 *
 * @example
 * ```typescript
 * import { UpdateSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, update] = UpdateSchemaObject.safeParse({
 *   update_id: 1001,
 *   message: {
 *     message_id: 7,
 *     date: 1735689600,
 *     chat: { id: 42, type: 'private', first_name: 'Ada' },
 *     from: { id: 42, is_bot: false, first_name: 'Ada' },
 *     text: '/status',
 *     entities: [{ type: 'bot_command', offset: 0, length: 7 }],
 *   },
 * });
 * if (!error) {
 *   console.log(update.message?.text);
 * }
 * ```
 */

/**
 * The update kinds Telegram documents at the time of writing, in the order
 * of the `Update` reference. These are also the values `setWebhook`'s
 * `allowed_updates` accepts.
 */
export const UPDATE_TYPES = [
  'message',
  'edited_message',
  'channel_post',
  'edited_channel_post',
  'business_connection',
  'business_message',
  'edited_business_message',
  'deleted_business_messages',
  'guest_message',
  'message_reaction',
  'message_reaction_count',
  'inline_query',
  'chosen_inline_result',
  'callback_query',
  'shipping_query',
  'pre_checkout_query',
  'purchased_paid_media',
  'poll',
  'poll_answer',
  'my_chat_member',
  'chat_member',
  'chat_join_request',
  'chat_boost',
  'removed_chat_boost',
  'managed_bot',
  'subscription',
  'stopped_message_generation',
] as const;

/** One of the documented update kinds in {@link UPDATE_TYPES}. */
export type UpdateType = (typeof UPDATE_TYPES)[number];

/** Documented `ChatMember.status` values. */
export const CHAT_MEMBER_STATUSES = [
  'creator',
  'administrator',
  'member',
  'restricted',
  'left',
  'kicked',
] as const;

/**
 * Schema for an `InaccessibleMessage`: a message that was deleted or is
 * otherwise no longer accessible to the bot. `date` is always `0`, which
 * is how it is told apart from a regular message.
 *
 * @example
 * ```typescript
 * import { InaccessibleMessageSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * InaccessibleMessageSchemaObject.parse({
 *   chat: { id: 42, type: 'private', first_name: 'Ada' },
 *   message_id: 7,
 *   date: 0,
 * });
 * ```
 */
export type InaccessibleMessageSchema = {
  /** Chat the message belonged to. */
  chat: ChatSchema;
  /** Message identifier inside the chat. */
  message_id: number;
  /** Always `0`. */
  date: 0;
};

/** A message the bot can no longer access (`date: 0`). */
export const InaccessibleMessageSchemaObject: BaseGuardian<
  InaccessibleMessageSchema
> = Guardian.object({
  chat: ChatSchemaObject,
  message_id: Guardian.number().integer(),
  date: Guardian.literal(0),
}).passthrough().describe({
  title: 'Inaccessible message',
  description: 'A message the bot can no longer access (`date: 0`).',
});

/**
 * A callback query's `message`: the full {@link MessageSchema}, or an
 * {@link InaccessibleMessageSchema} when the message is too old or was
 * deleted. Check `date === 0` (or `'text' in message`) before reading
 * message content.
 */
export type MaybeInaccessibleMessageSchema =
  | MessageSchema
  | InaccessibleMessageSchema;

/**
 * Validates a `MaybeInaccessibleMessage`, trying the inaccessible form
 * (`date: 0`) first.
 *
 * @example
 * ```typescript
 * import { MaybeInaccessibleMessageSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const message = MaybeInaccessibleMessageSchemaObject.parse({
 *   chat: { id: 42, type: 'private', first_name: 'Ada' },
 *   message_id: 7,
 *   date: 0,
 * });
 * console.log(message.date === 0 ? 'inaccessible' : 'accessible');
 * ```
 */
export const MaybeInaccessibleMessageSchemaObject: BaseGuardian<
  MaybeInaccessibleMessageSchema
> = Guardian.oneOf(
  [InaccessibleMessageSchemaObject, MessageSchemaObject],
  'expected a Message or an InaccessibleMessage',
).describe({
  title: 'Maybe-inaccessible message',
  description: 'A Message, or an InaccessibleMessage with `date: 0`.',
});

/**
 * Schema for a `CallbackQuery`: a user pressed a `callback_data` button.
 *
 * Answer every callback query with `answerCallbackQuery`, even without a
 * notification text; the user's client shows a progress indicator until
 * you do. `data` is the button's `callback_data` and is set by whoever
 * built the keyboard, but it arrives from the user's client: treat it as
 * untrusted input and check the user (`from.id`) is allowed to perform
 * the action it names.
 *
 * @example
 * ```typescript
 * import { CallbackQuerySchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const query = CallbackQuerySchemaObject.parse({
 *   id: '4382bfdwdsb323b2d9',
 *   from: { id: 42, is_bot: false, first_name: 'Ada' },
 *   chat_instance: '-1234567890',
 *   data: 'ack:17',
 * });
 * console.log(query.data);
 * ```
 */
export type CallbackQuerySchema = {
  /** Identifier to pass to `answerCallbackQuery`. */
  id: string;
  /** User who pressed the button. */
  from: UserSchema;
  /** Message carrying the button, when the bot sent it; may be inaccessible. */
  message?: MaybeInaccessibleMessageSchema;
  /** Identifier of the inline-mode message carrying the button. */
  inline_message_id?: string;
  /** Global identifier of the chat the button's message was sent to. */
  chat_instance: string;
  /** The button's `callback_data`. Exactly one of `data`/`game_short_name` is set. */
  data?: string;
  /** Short name of the game to launch. */
  game_short_name?: string;
};

/** An incoming callback query from an inline keyboard button. */
export const CallbackQuerySchemaObject: BaseGuardian<CallbackQuerySchema> =
  Guardian.object({
    id: Guardian.string(),
    from: UserSchemaObject,
    message: MaybeInaccessibleMessageSchemaObject.optional(),
    inline_message_id: Guardian.string().optional(),
    chat_instance: Guardian.string(),
    data: Guardian.string().optional(),
    game_short_name: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'Callback query',
    description: 'An incoming callback query from an inline keyboard button.',
  });

/**
 * Schema for a `ChatMember`, reduced to what every member variant shares:
 * `status` and `user`. Variant-specific fields (administrator rights,
 * restriction dates, …) are kept by `.passthrough()`. `status` is any
 * string, so a status Telegram adds later does not fail the parse; see
 * {@link CHAT_MEMBER_STATUSES} for the documented values.
 *
 * @example
 * ```typescript
 * import { ChatMemberSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * ChatMemberSchemaObject.parse({
 *   status: 'kicked',
 *   user: { id: 42, is_bot: true, first_name: 'Bot' },
 *   until_date: 0,
 * });
 * ```
 */
export type ChatMemberSchema = {
  /** Member status: one of {@link CHAT_MEMBER_STATUSES}, or a newer one. */
  status: string;
  /** The member. */
  user: UserSchema;
};

/** One member of a chat (status and user). */
export const ChatMemberSchemaObject: BaseGuardian<ChatMemberSchema> = Guardian
  .object({
    status: Guardian.string().minLength(1),
    user: UserSchemaObject,
  }).passthrough().describe({
    title: 'Chat member',
    description: 'One member of a chat (status and user).',
  });

/**
 * Schema for a `ChatMemberUpdated` — a chat member's status changed. As
 * `my_chat_member`, it reports the BOT's own status: added to a group,
 * promoted, removed, or (in a private chat) blocked or unblocked by the
 * user.
 *
 * @example
 * ```typescript
 * import { ChatMemberUpdatedSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const change = ChatMemberUpdatedSchemaObject.parse({
 *   chat: { id: 42, type: 'private', first_name: 'Ada' },
 *   from: { id: 42, is_bot: false, first_name: 'Ada' },
 *   date: 1735689600,
 *   old_chat_member: { status: 'member', user: { id: 1, is_bot: true, first_name: 'Bot' } },
 *   new_chat_member: { status: 'kicked', user: { id: 1, is_bot: true, first_name: 'Bot' } },
 * });
 * console.log(change.new_chat_member.status); // 'kicked': the user blocked the bot
 * ```
 */
export type ChatMemberUpdatedSchema = {
  /** Chat the member belongs to. */
  chat: ChatSchema;
  /** User who made the change. */
  from: UserSchema;
  /** Unix time of the change. */
  date: number;
  /** The member before the change. */
  old_chat_member: ChatMemberSchema;
  /** The member after the change. */
  new_chat_member: ChatMemberSchema;
  /** Invite link used to join, for joins by invite link. */
  invite_link?: Record<string, unknown>;
  /** Whether the user joined via an approved join request without an invite link. */
  via_join_request?: boolean;
  /** Whether the user joined via a chat folder invite link. */
  via_chat_folder_invite_link?: boolean;
};

/** A change in a chat member's status. */
export const ChatMemberUpdatedSchemaObject: BaseGuardian<
  ChatMemberUpdatedSchema
> = Guardian.object({
  chat: ChatSchemaObject,
  from: UserSchemaObject,
  date: Guardian.number().integer(),
  old_chat_member: ChatMemberSchemaObject,
  new_chat_member: ChatMemberSchemaObject,
  invite_link: Guardian.object({}).passthrough().optional(),
  via_join_request: Guardian.boolean().optional(),
  via_chat_folder_invite_link: Guardian.boolean().optional(),
}).passthrough().describe({
  title: 'Chat member updated',
  description: "A change in a chat member's status.",
});

/**
 * Schema for an `Update`, the body of every webhook request.
 *
 * At most one of the optional fields is present. Kinds modeled here are
 * typed; every other kind (see {@link UPDATE_TYPES}) is kept as an untyped
 * property by `.passthrough()` — read it through a
 * `Record<string, unknown>` cast. `Telegram.updateKind(update)` tells
 * which kind an update is.
 */
export type UpdateSchema = {
  /** Sequential update identifier; useful to ignore a redelivered update. */
  update_id: number;
  /** New incoming message of any kind. */
  message?: MessageSchema;
  /** New version of a message the bot knows about. */
  edited_message?: MessageSchema;
  /** New channel post. */
  channel_post?: MessageSchema;
  /** New version of a channel post. */
  edited_channel_post?: MessageSchema;
  /** A user pressed a callback button. */
  callback_query?: CallbackQuerySchema;
  /** The bot's own member status changed in a chat. */
  my_chat_member?: ChatMemberUpdatedSchema;
  /**
   * Another member's status changed. Delivered only to administrators and
   * only when `chat_member` is listed in `allowed_updates`.
   */
  chat_member?: ChatMemberUpdatedSchema;
};

/** One incoming update, as posted to a webhook. */
export const UpdateSchemaObject: BaseGuardian<UpdateSchema> = Guardian.object({
  update_id: Guardian.number().integer(),
  message: MessageSchemaObject.optional(),
  edited_message: MessageSchemaObject.optional(),
  channel_post: MessageSchemaObject.optional(),
  edited_channel_post: MessageSchemaObject.optional(),
  callback_query: CallbackQuerySchemaObject.optional(),
  my_chat_member: ChatMemberUpdatedSchemaObject.optional(),
  chat_member: ChatMemberUpdatedSchemaObject.optional(),
}).passthrough().describe({
  title: 'Update',
  description: 'One incoming update, as posted to a webhook.',
});
