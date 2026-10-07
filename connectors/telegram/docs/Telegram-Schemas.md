# Telegram Schemas

The `@tundraconnect/telegram/schemas` subpath exports Guardian validators
and their TypeScript types. Every client method validates its request
against the matching request schema before sending it, and validates the
unwrapped `result` against a response schema.

```ts
import {
  type SendMessageRequestSchema,
  SendMessageRequestSchemaObject,
} from '@tundraconnect/telegram/schemas';

const payload: unknown = {
  chat_id: '@examplechannel',
  text: 'Hello!',
};

const [error, request] = SendMessageRequestSchemaObject.safeParse(payload);
if (error || !request) throw error;

const typedRequest: SendMessageRequestSchema = request;
console.log(typedRequest.text);
```

Two rules hold throughout:

- **Request schemas are strict.** An unknown key is rejected
  ("Unknown property 'x' is not allowed in strict mode") instead of being
  dropped, and booleans and numbers must be real booleans and numbers
  (`'true'` and `'40'` are rejected, not coerced).
- **Response and update schemas pass unknown fields through.** Telegram adds
  fields and update kinds over time; they stay reachable at runtime (through
  a `Record<string, unknown>` cast) and never fail the parse. A
  `MessageEntity.type` or `ChatMember.status` value this package doesn't
  know is accepted for the same reason. `Chat.type` is still checked against
  the four documented values.

## Request Schemas

| Schema                                      | Purpose                                                           |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `SendMessageRequestSchemaObject`            | Body for `POST /sendMessage`                                      |
| `EditMessageTextRequestSchemaObject`        | Body for `POST /editMessageText`                                  |
| `EditMessageReplyMarkupRequestSchemaObject` | Body for `POST /editMessageReplyMarkup`                           |
| `DeleteMessageRequestSchemaObject`          | Body for `POST /deleteMessage`                                    |
| `AnswerCallbackQueryRequestSchemaObject`    | Body for `POST /answerCallbackQuery` (`text` 0-200 characters)    |
| `SetWebhookRequestSchemaObject`             | Body for `POST /setWebhook` (`secret_token` required)             |
| `DeleteWebhookRequestSchemaObject`          | Body for `POST /deleteWebhook`                                    |
| `SetMyCommandsRequestSchemaObject`          | Body for `POST /setMyCommands` (at most 100 commands)             |
| `GetMyCommandsRequestSchemaObject`          | Body for `POST /getMyCommands`                                    |
| `DeleteMyCommandsRequestSchemaObject`       | Body for `POST /deleteMyCommands` (same shape as `getMyCommands`) |

### Message options and keyboards

| Schema                                                                         | Purpose                                                                       |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `LinkPreviewOptionsSchemaObject`                                               | `link_preview_options`                                                        |
| `ReplyParametersSchemaObject`                                                  | `reply_parameters`; needs `message_id` (or `ephemeral_message_id`)            |
| `ReplyMarkupSchemaObject`                                                      | `sendMessage`'s `reply_markup`: any of the four shapes below                  |
| `InlineKeyboardMarkupSchemaObject`                                             | `{ inline_keyboard: InlineKeyboardButton[][] }`; the only markup edits accept |
| `InlineKeyboardButtonSchemaObject`                                             | One inline button: exactly one action; `callback_data` 1-64 bytes of UTF-8    |
| `ReplyKeyboardMarkupSchemaObject`                                              | A custom reply keyboard; buttons are strings or `KeyboardButton`s             |
| `KeyboardButtonSchemaObject`                                                   | One reply-keyboard button; at most one `request_*`/`web_app` action           |
| `ReplyKeyboardRemoveSchemaObject`                                              | `{ remove_keyboard: true }`                                                   |
| `ForceReplySchemaObject`                                                       | `{ force_reply: true }`                                                       |
| `WebAppInfoSchemaObject`, `LoginUrlSchemaObject`, `CopyTextButtonSchemaObject` | Objects nested in inline buttons                                              |

### Command menu

| Schema                         | Purpose                                                                 |
| ------------------------------ | ----------------------------------------------------------------------- |
| `BotCommandSchemaObject`       | `{ command, description }`: 1-32 of `a-z 0-9 _`, and 1-256 characters   |
| `BotCommandScopeSchemaObject`  | `BotCommandScope`, discriminated on `type` (seven variants)             |
| `BotCommandScope*SchemaObject` | Each scope variant on its own (`Default`, `AllPrivateChats`, `Chat`, …) |

## Response Schemas

| Schema                           | Purpose                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `MessageSchemaObject`            | A `Message`: sent, edited, or received in an update                                |
| `MessageEntitySchemaObject`      | One `MessageEntity` (a `bot_command`, URL, bold span, …); offsets in UTF-16 units  |
| `UserSchemaObject`               | A `User`: the bot from `getMe()`, or a message's `from`                            |
| `ChatSchemaObject`               | The `Chat` a message belongs to                                                    |
| `EditMessageResultSchemaObject`  | `editMessageText`/`editMessageReplyMarkup` result: a `Message`, or `true`          |
| `TrueResultSchemaObject`         | The bare `true` most other methods return                                          |
| `WebhookInfoSchemaObject`        | `getWebhookInfo()`'s result                                                        |
| `BotCommandListSchemaObject`     | `getMyCommands()`'s result                                                         |
| `ResponseEnvelopeSchemaObject`   | Telegram's universal `{ ok, result, error_code, description, parameters }` wrapper |
| `ResponseParametersSchemaObject` | The envelope's `parameters` field (`retry_after`, `migrate_to_chat_id`)            |

## Webhook Updates

| Schema                                 | Purpose                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `UpdateSchemaObject`                   | One webhook `Update`                                                          |
| `CallbackQuerySchemaObject`            | `update.callback_query`: `id`, `from`, `data`, `message`, …                   |
| `MaybeInaccessibleMessageSchemaObject` | A callback query's `message`: a `Message`, or an inaccessible one (`date: 0`) |
| `InaccessibleMessageSchemaObject`      | A deleted or too-old message: only `chat`, `message_id` and `date: 0`         |
| `ChatMemberUpdatedSchemaObject`        | `update.my_chat_member` / `update.chat_member`                                |
| `ChatMemberSchemaObject`               | A chat member's `status` and `user`; variant fields pass through              |

`UpdateSchema` types `message`, `edited_message`, `channel_post`,
`edited_channel_post`, `callback_query`, `my_chat_member` and `chat_member`.
Every other documented kind (listed in `UPDATE_TYPES`) and any future kind
is kept untyped. `Telegram.updateKind(update)` names the kind.

`Message` models the fields a text bot uses — `from`, `chat`, `text`,
`entities`, `edit_date`, `message_thread_id`, `sender_chat`, and the
`migrate_to_chat_id`/`migrate_from_chat_id` service fields — out of the
100+ Telegram documents.

## Common Validators and Constants

| Export                                                                        | Purpose                                                                             |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `chatIdGuard`                                                                 | A `chat_id`: an integer, or an `@username` string (a numeric string stays a string) |
| `botTokenGuard`                                                               | A bot token: `<digits>:<secret>`                                                    |
| `webhookSecretTokenGuard`                                                     | A webhook `secret_token`: 1-256 of `A-Z a-z 0-9 _ -`; never echoes the value        |
| `PARSE_MODES`                                                                 | `'MarkdownV2'`, `'HTML'`, `'Markdown'`                                              |
| `MESSAGE_TEXT_MAX_LENGTH`                                                     | `4096`; see the counting caveat in [API](Telegram-API.md)                           |
| `CALLBACK_DATA_MAX_BYTES`                                                     | `64`                                                                                |
| `CALLBACK_ANSWER_TEXT_MAX_LENGTH`                                             | `200`                                                                               |
| `MAX_BOT_COMMANDS`                                                            | `100`                                                                               |
| `UPDATE_TYPES`                                                                | Every documented update kind; also what `allowed_updates` accepts                   |
| `WEBHOOK_SECRET_TOKEN_PATTERN`                                                | The `secret_token` pattern                                                          |
| `WEBHOOK_PORTS`                                                               | `443`, `80`, `88`, `8443`                                                           |
| `CHAT_TYPES`, `CHAT_MEMBER_STATUSES`, `MESSAGE_ENTITY_TYPES`, `BUTTON_STYLES` | The documented values of those fields                                               |

---

[← Back to Telegram](../README.md)
