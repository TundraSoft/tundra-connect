import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Keyboard markup a message can carry: an inline keyboard of buttons under
 * the message, a custom reply keyboard, an instruction to remove the reply
 * keyboard, or a forced-reply prompt.
 *
 * Every schema here is a REQUEST schema and is `.strict()`: an unknown key
 * is rejected locally instead of being dropped, so a typo such as
 * `callback` for `callback_data` fails before the request is sent.
 *
 * @example
 * ```typescript
 * import { InlineKeyboardMarkupSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, markup] = InlineKeyboardMarkupSchemaObject.safeParse({
 *   inline_keyboard: [[
 *     { text: 'Open dashboard', url: 'https://example.com/dashboard' },
 *     { text: 'Acknowledge', callback_data: 'ack:42' },
 *   ]],
 * });
 * if (!error) {
 *   console.log(markup.inline_keyboard.length);
 * }
 * ```
 */

/** Documented button `style` values (button colour). */
export const BUTTON_STYLES = ['danger', 'success', 'primary'] as const;

/** Maximum `callback_data` size, in UTF-8 bytes. */
export const CALLBACK_DATA_MAX_BYTES = 64;

/**
 * The fields of an `InlineKeyboardButton` that set what the button does.
 * Telegram requires exactly one of them per button.
 */
const INLINE_BUTTON_ACTIONS = [
  'url',
  'callback_data',
  'web_app',
  'login_url',
  'switch_inline_query',
  'switch_inline_query_current_chat',
  'switch_inline_query_chosen_chat',
  'copy_text',
  'callback_game',
  'pay',
] as const;

/** The `KeyboardButton` fields that make it more than a plain text button. */
const KEYBOARD_BUTTON_ACTIONS = [
  'request_users',
  'request_chat',
  'request_contact',
  'request_location',
  'request_poll',
  'web_app',
] as const;

const UTF8 = new TextEncoder();

/** How many of `keys` are set (not `undefined`) on `value`. */
function countSet(
  value: Record<string, unknown>,
  keys: readonly string[],
): number {
  return keys.filter((key) => value[key] !== undefined).length;
}

/** A Web App launched by a button. */
export type WebAppInfoSchema = {
  /** HTTPS URL of the Web App. */
  url: string;
};

/** Validates a `WebAppInfo` object. */
export const WebAppInfoSchemaObject: BaseGuardian<WebAppInfoSchema> = Guardian
  .object({
    url: Guardian.string().pattern(
      /^https:\/\/\S+$/,
      'web_app.url must be an https:// URL',
    ),
  }).strict().describe({
    title: 'Web App info',
    description: 'A Web App launched by a button.',
  });

/** A login button that authorizes the user on a website. */
export type LoginUrlSchema = {
  /** HTTPS URL opened with the user's authorization data appended. */
  url: string;
  /** New text of the button in forwarded messages. */
  forward_text?: string;
  /** Username of the bot used for authorization. */
  bot_username?: string;
  /** Request permission for the bot to send messages to the user. */
  request_write_access?: boolean;
};

/** Validates a `LoginUrl` object. */
export const LoginUrlSchemaObject: BaseGuardian<LoginUrlSchema> = Guardian
  .object({
    url: Guardian.string().pattern(
      /^https:\/\/\S+$/,
      'login_url.url must be an https:// URL',
    ),
    forward_text: Guardian.string().optional(),
    bot_username: Guardian.string().optional(),
    request_write_access: Guardian.boolean().strict().optional(),
  }).strict().describe({
    title: 'Login URL',
    description: 'A login button that authorizes the user on a website.',
  });

/** A button that copies text to the clipboard. */
export type CopyTextButtonSchema = {
  /** Text copied to the clipboard; 1-256 characters. */
  text: string;
};

/** Validates a `CopyTextButton` object. */
export const CopyTextButtonSchemaObject: BaseGuardian<CopyTextButtonSchema> =
  Guardian.object({
    text: Guardian.string().minLength(1).maxLength(256),
  }).strict().describe({
    title: 'Copy text button',
    description: 'A button that copies text to the clipboard.',
  });

/**
 * Schema for one `InlineKeyboardButton`.
 *
 * Telegram requires exactly one action field per button (`url`,
 * `callback_data`, `web_app`, `login_url`, `switch_inline_query`,
 * `switch_inline_query_current_chat`, `switch_inline_query_chosen_chat`,
 * `copy_text`, `callback_game` or `pay`); `text`, `style` and
 * `icon_custom_emoji_id` don't count. A button with none or with two is
 * rejected locally.
 *
 * `callback_data` is limited to 1-64 BYTES of UTF-8, not characters: a
 * Cyrillic letter takes two bytes and most emoji four, so 64 characters
 * of non-ASCII text can be well over the limit.
 *
 * The `disabled` button field and `switch_inline_query_chosen_chat`'s
 * inner shape are not modeled (the latter is passed through as an
 * object).
 *
 * @example
 * ```typescript
 * import { InlineKeyboardButtonSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, button] = InlineKeyboardButtonSchemaObject.safeParse({
 *   text: 'Mute for 1h',
 *   callback_data: 'mute:3600',
 * });
 * if (!error) {
 *   console.log(button.callback_data);
 * }
 * ```
 */
export type InlineKeyboardButtonSchema = {
  /** Label text on the button. */
  text: string;
  /** Button colour; an app-specific style is used when omitted. */
  style?: (typeof BUTTON_STYLES)[number];
  /** Custom emoji shown before the text (restricted; see Telegram's docs). */
  icon_custom_emoji_id?: string;
  /** HTTP(S) or `tg://` URL opened when the button is pressed. */
  url?: string;
  /** Data sent back in a callback query when pressed; 1-64 bytes of UTF-8. */
  callback_data?: string;
  /** Web App launched when pressed; private chats only. */
  web_app?: WebAppInfoSchema;
  /** HTTPS URL used to authorize the user. */
  login_url?: LoginUrlSchema;
  /** Prompt the user to pick a chat and insert this inline query there. */
  switch_inline_query?: string;
  /** Insert this inline query in the current chat's input field. */
  switch_inline_query_current_chat?: string;
  /** Prompt the user to pick a chat of a given type; passed through as-is. */
  switch_inline_query_chosen_chat?: Record<string, unknown>;
  /** Copy text to the clipboard when pressed. */
  copy_text?: CopyTextButtonSchema;
  /** Launch a game; must be the first button in the first row. */
  callback_game?: Record<string, unknown>;
  /** Pay button; must be the first button in the first row of an invoice. */
  pay?: true;
};

/** One button of an inline keyboard, with exactly one action. */
export const InlineKeyboardButtonSchemaObject: BaseGuardian<
  InlineKeyboardButtonSchema
> = Guardian.object({
  text: Guardian.string().minLength(1),
  style: Guardian.enum(BUTTON_STYLES).optional(),
  icon_custom_emoji_id: Guardian.string().optional(),
  url: Guardian.string().pattern(
    /^(https?|tg):\/\/\S+$/i,
    'url must be an http(s):// or tg:// URL',
  ).optional(),
  callback_data: Guardian.string().refine(
    (data) => {
      const bytes = UTF8.encode(data).length;
      return bytes >= 1 && bytes <= CALLBACK_DATA_MAX_BYTES;
    },
    `callback_data must be 1-${CALLBACK_DATA_MAX_BYTES} bytes of UTF-8`,
  ).optional(),
  web_app: WebAppInfoSchemaObject.optional(),
  login_url: LoginUrlSchemaObject.optional(),
  switch_inline_query: Guardian.string().optional(),
  switch_inline_query_current_chat: Guardian.string().optional(),
  switch_inline_query_chosen_chat: Guardian.object({}).passthrough()
    .optional(),
  copy_text: CopyTextButtonSchemaObject.optional(),
  callback_game: Guardian.object({}).passthrough().optional(),
  pay: Guardian.literal(true).optional(),
}).strict().refine(
  (button) => countSet(button, INLINE_BUTTON_ACTIONS) === 1,
  `an inline keyboard button needs exactly one of ${
    INLINE_BUTTON_ACTIONS.join(', ')
  }`,
).describe({
  title: 'Inline keyboard button',
  description: 'One button of an inline keyboard, with exactly one action.',
}) as unknown as BaseGuardian<InlineKeyboardButtonSchema>;

/**
 * Schema for an `InlineKeyboardMarkup` — rows of buttons shown under a
 * message.
 *
 * @example
 * ```typescript
 * import { InlineKeyboardMarkupSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * InlineKeyboardMarkupSchemaObject.parse({
 *   inline_keyboard: [[{ text: 'Details', callback_data: 'details:7' }]],
 * });
 * ```
 */
export type InlineKeyboardMarkupSchema = {
  /** Button rows, each an array of buttons. */
  inline_keyboard: InlineKeyboardButtonSchema[][];
  /**
   * Show the reply interface, as if the user had tapped 'Reply' on the
   * bot's message. Can't be changed when the keyboard is edited.
   */
  force_reply?: boolean;
};

/** An inline keyboard attached to a message. */
export const InlineKeyboardMarkupSchemaObject: BaseGuardian<
  InlineKeyboardMarkupSchema
> = Guardian.object({
  inline_keyboard: Guardian.array(
    Guardian.array(InlineKeyboardButtonSchemaObject),
  ),
  force_reply: Guardian.boolean().strict().optional(),
}).strict().describe({
  title: 'Inline keyboard markup',
  description: 'An inline keyboard attached to a message.',
});

/**
 * Schema for one `KeyboardButton` of a custom reply keyboard.
 *
 * A plain string is also accepted wherever a button is (Telegram's
 * shorthand for a text-only button). At most one of `request_users`,
 * `request_chat`, `request_contact`, `request_location`, `request_poll`
 * and `web_app` may be set. The `request_users`/`request_chat`/
 * `request_poll` objects are passed through as-is.
 *
 * @example
 * ```typescript
 * import { KeyboardButtonSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * KeyboardButtonSchemaObject.parse({
 *   text: 'Share location',
 *   request_location: true,
 * });
 * ```
 */
export type KeyboardButtonSchema = {
  /** Button text; sent as a message when no action field is set. */
  text: string;
  /** Button colour; an app-specific style is used when omitted. */
  style?: (typeof BUTTON_STYLES)[number];
  /** Custom emoji shown before the text (restricted; see Telegram's docs). */
  icon_custom_emoji_id?: string;
  /** Open a user picker; private chats only. */
  request_users?: Record<string, unknown>;
  /** Open a chat picker; private chats only. */
  request_chat?: Record<string, unknown>;
  /** Send the user's phone number as a contact; private chats only. */
  request_contact?: boolean;
  /** Send the user's current location; private chats only. */
  request_location?: boolean;
  /** Ask the user to create a poll; private chats only. */
  request_poll?: Record<string, unknown>;
  /** Launch a Web App; private chats only. */
  web_app?: WebAppInfoSchema;
};

/** One button of a custom reply keyboard. */
export const KeyboardButtonSchemaObject: BaseGuardian<KeyboardButtonSchema> =
  Guardian.object({
    text: Guardian.string().minLength(1),
    style: Guardian.enum(BUTTON_STYLES).optional(),
    icon_custom_emoji_id: Guardian.string().optional(),
    request_users: Guardian.object({}).passthrough().optional(),
    request_chat: Guardian.object({}).passthrough().optional(),
    request_contact: Guardian.boolean().strict().optional(),
    request_location: Guardian.boolean().strict().optional(),
    request_poll: Guardian.object({}).passthrough().optional(),
    web_app: WebAppInfoSchemaObject.optional(),
  }).strict().refine(
    (button) => countSet(button, KEYBOARD_BUTTON_ACTIONS) <= 1,
    `a keyboard button may set at most one of ${
      KEYBOARD_BUTTON_ACTIONS.join(', ')
    }`,
  ).describe({
    title: 'Keyboard button',
    description: 'One button of a custom reply keyboard.',
  }) as unknown as BaseGuardian<KeyboardButtonSchema>;

/**
 * Schema for a `ReplyKeyboardMarkup` — a custom keyboard that replaces the
 * user's letter keyboard. Not supported in channels.
 *
 * @example
 * ```typescript
 * import { ReplyKeyboardMarkupSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * ReplyKeyboardMarkupSchemaObject.parse({
 *   keyboard: [['/today', '/week'], ['/status']],
 *   resize_keyboard: true,
 *   one_time_keyboard: true,
 * });
 * ```
 */
export type ReplyKeyboardMarkupSchema = {
  /** Button rows; each button is a {@link KeyboardButtonSchema} or plain text. */
  keyboard: (string | KeyboardButtonSchema)[][];
  /** Keep the keyboard shown when the regular keyboard is hidden. */
  is_persistent?: boolean;
  /** Fit the keyboard's height to its rows. */
  resize_keyboard?: boolean;
  /** Hide the keyboard once a button has been used. */
  one_time_keyboard?: boolean;
  /** Placeholder shown in the input field; 1-64 characters. */
  input_field_placeholder?: string;
  /** Show the keyboard only to mentioned users / the replied-to sender. */
  selective?: boolean;
  /** Show the reply interface, as if the user had tapped 'Reply'. */
  force_reply?: boolean;
};

/** A custom reply keyboard. */
export const ReplyKeyboardMarkupSchemaObject: BaseGuardian<
  ReplyKeyboardMarkupSchema
> = Guardian.object({
  keyboard: Guardian.array(
    Guardian.array(
      Guardian.oneOf(
        [
          Guardian.unknown<string>().test(
            (value) => typeof value === 'string' && value.length > 0,
            'a keyboard button must be a non-empty string or a KeyboardButton',
          ),
          KeyboardButtonSchemaObject,
        ],
        'a keyboard button must be a non-empty string or a KeyboardButton',
      ),
    ),
  ),
  is_persistent: Guardian.boolean().strict().optional(),
  resize_keyboard: Guardian.boolean().strict().optional(),
  one_time_keyboard: Guardian.boolean().strict().optional(),
  input_field_placeholder: Guardian.string().minLength(1).maxLength(64)
    .optional(),
  selective: Guardian.boolean().strict().optional(),
  force_reply: Guardian.boolean().strict().optional(),
}).strict().describe({
  title: 'Reply keyboard markup',
  description: 'A custom reply keyboard.',
});

/**
 * Schema for a `ReplyKeyboardRemove` — removes the current custom
 * keyboard. Not supported in channels.
 *
 * @example
 * ```typescript
 * import { ReplyKeyboardRemoveSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * ReplyKeyboardRemoveSchemaObject.parse({ remove_keyboard: true });
 * ```
 */
export type ReplyKeyboardRemoveSchema = {
  /** Always `true`. */
  remove_keyboard: true;
  /** Remove the keyboard only for mentioned users / the replied-to sender. */
  selective?: boolean;
};

/** An instruction to remove the current custom keyboard. */
export const ReplyKeyboardRemoveSchemaObject: BaseGuardian<
  ReplyKeyboardRemoveSchema
> = Guardian.object({
  remove_keyboard: Guardian.literal(true),
  selective: Guardian.boolean().strict().optional(),
}).strict().describe({
  title: 'Reply keyboard remove',
  description: 'An instruction to remove the current custom keyboard.',
});

/**
 * Schema for a `ForceReply` — shows the reply interface to the user, as if
 * they had tapped 'Reply' on the bot's message.
 *
 * @example
 * ```typescript
 * import { ForceReplySchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * ForceReplySchemaObject.parse({
 *   force_reply: true,
 *   input_field_placeholder: 'Org slug',
 * });
 * ```
 */
export type ForceReplySchema = {
  /** Always `true`. */
  force_reply: true;
  /** Placeholder shown in the input field; 1-64 characters. */
  input_field_placeholder?: string;
  /** Force a reply only from mentioned users / the replied-to sender. */
  selective?: boolean;
};

/** An instruction to show the reply interface. */
export const ForceReplySchemaObject: BaseGuardian<ForceReplySchema> = Guardian
  .object({
    force_reply: Guardian.literal(true),
    input_field_placeholder: Guardian.string().minLength(1).maxLength(64)
      .optional(),
    selective: Guardian.boolean().strict().optional(),
  }).strict().describe({
    title: 'Force reply',
    description: 'An instruction to show the reply interface.',
  });

/** Any of the four `reply_markup` shapes `sendMessage` accepts. */
export type ReplyMarkupSchema =
  | InlineKeyboardMarkupSchema
  | ReplyKeyboardMarkupSchema
  | ReplyKeyboardRemoveSchema
  | ForceReplySchema;

/**
 * Validates `sendMessage`'s `reply_markup`: an inline keyboard, a custom
 * reply keyboard, a keyboard removal, or a forced reply. When none match,
 * the error's `toJSON()` carries each shape's own failure, so a
 * `callback_data` that is too long is still reported as such.
 *
 * @example
 * ```typescript
 * import { ReplyMarkupSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * ReplyMarkupSchemaObject.parse({ remove_keyboard: true });
 * ```
 */
export const ReplyMarkupSchemaObject: BaseGuardian<ReplyMarkupSchema> = Guardian
  .oneOf(
    [
      InlineKeyboardMarkupSchemaObject,
      ReplyKeyboardMarkupSchemaObject,
      ReplyKeyboardRemoveSchemaObject,
      ForceReplySchemaObject,
    ],
    'reply_markup must be an InlineKeyboardMarkup, ReplyKeyboardMarkup, ReplyKeyboardRemove or ForceReply',
  ).describe({
    title: 'Reply markup',
    description:
      'An inline keyboard, custom reply keyboard, keyboard removal or forced reply.',
  });
