# Telegram API

## Configuration

```ts
import { Telegram } from '@tundraconnect/telegram';

const client = new Telegram({
  botToken: '123456789:AAExampleToken',
  timeout: 30,
});
```

`botToken` is required — the client throws `TelegramError`
(`CONFIG_INVALID_BOT_TOKEN`) at construction if it's missing, blank, or not
a string. Get one from [@BotFather](https://t.me/BotFather) with `/newbot`.

There is no `auth` option. Telegram authenticates a bot by embedding its
token directly in the request path — `https://api.telegram.org/bot<token>/<method>`
(literally `bot` concatenated with the token, no separator) — not via a
header or query parameter, so it doesn't fit RESTler's `auth: RESTlerAuth`
model at all (similar to how a webhook URL doesn't). Instead, `botToken` is
validated up front and folded into `baseURL` before the request layer is
initialized, so every endpoint call below just uses a plain relative path
like `/sendMessage`.

`baseURL` defaults to `https://api.telegram.org/bot<token>`. An explicit
`baseURL` names only the **server origin** to target — for example a
[self-hosted Bot API server](https://github.com/tdlib/telegram-bot-api),
which routes with the identical `/bot<token>/<method>` shape — and the
`/bot<token>` segment is always appended to it (a trailing slash is
normalized away first, and a value that already ends in `/bot<token>` is
left as-is). An override can change where requests go, but never strips
the credential segment from the request path:

```ts
const client = new Telegram({
  botToken: '123456789:AAExampleToken',
  baseURL: 'http://localhost:8081',
});
// requests go to http://localhost:8081/bot123456789:AAExampleToken/<method>
```

`timeout` is expressed in seconds and defaults to `30`.

## Endpoints

Every method validates its request locally before sending it and throws
`TelegramError` (`REQUEST_VALIDATION_ERROR`) without making a request when
it fails. Request schemas are strict: an unknown key is an error, not
silently dropped, and booleans and numbers are not coerced from strings.

| Method                     | Endpoint                       | Result                              |
| -------------------------- | ------------------------------ | ----------------------------------- |
| `sendMessage()`            | `POST /sendMessage`            | The sent `Message`                  |
| `editMessageText()`        | `POST /editMessageText`        | The edited `Message`, or `true`     |
| `editMessageReplyMarkup()` | `POST /editMessageReplyMarkup` | The edited `Message`, or `true`     |
| `deleteMessage()`          | `POST /deleteMessage`          | `true`                              |
| `answerCallbackQuery()`    | `POST /answerCallbackQuery`    | `true`                              |
| `setWebhook()`             | `POST /setWebhook`             | `true`                              |
| `deleteWebhook()`          | `POST /deleteWebhook`          | `true`                              |
| `getWebhookInfo()`         | `GET /getWebhookInfo`          | `WebhookInfo`                       |
| `setMyCommands()`          | `POST /setMyCommands`          | `true`                              |
| `getMyCommands()`          | `POST /getMyCommands`          | `BotCommand[]` (`[]` when none set) |
| `deleteMyCommands()`       | `POST /deleteMyCommands`       | `true`                              |
| `getMe()`                  | `GET /getMe`                   | The bot's own `User`                |

Three static helpers need no client and make no request:

| Helper                                     | Purpose                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `Telegram.verifyWebhookRequest(options)`   | Check the webhook secret header in constant time, then parse the body        |
| `Telegram.updateKind(update)`              | Name an update's kind: `'message'`, `'callback_query'`, …, or `'unknown'`    |
| `Telegram.parseCommand(message, botName?)` | Parse `/command@BotName args` into `{ command, args, rawArgs, botUsername }` |

### `sendMessage()`

```ts
const message = await client.sendMessage({
  chat_id: '@examplechannel', // or an integer chat id
  text: 'Deployment finished successfully.',
});

console.log(message.message_id, message.chat.type);
```

`chat_id` accepts either the chat's integer id or an `@username` string
(public channels/supergroups only). Supported options include:

- **`parse_mode`** — `'HTML'`, `'MarkdownV2'` or the legacy `'Markdown'`.
  It's mutually exclusive with `entities` per Telegram's docs; that rule
  isn't enforced locally, and Telegram answers a request with both with a
  `400 Bad Request`.
- **`link_preview_options`** — `{ is_disabled, url, prefer_small_media,
  prefer_large_media, show_above_text }`. The legacy
  `disable_web_page_preview: true` is still accepted; setting both is
  refused locally.
- **`disable_notification`** — deliver silently.
- **`reply_parameters`** — `{ message_id, chat_id?, quote?, … }`; needs
  `message_id` (or `ephemeral_message_id`).
- **`reply_markup`** — an inline keyboard, a custom reply keyboard
  (`{ keyboard: [['/today', '/week']] }`), `{ remove_keyboard: true }` or
  `{ force_reply: true }`.

```ts
await client.sendMessage({
  chat_id: -1001234567890,
  text: '<b>Weekly summary</b>\n1,204 links, 98,311 clicks',
  parse_mode: 'HTML',
  disable_notification: true,
  link_preview_options: { is_disabled: true },
  reply_parameters: { message_id: 42, allow_sending_without_reply: true },
  reply_markup: {
    inline_keyboard: [
      [{ text: 'Open dashboard', url: 'https://example.com/dashboard' }],
      [
        { text: 'Mute 1h', callback_data: 'mute:ops:3600' },
        { text: 'Mute 1d', callback_data: 'mute:ops:86400' },
      ],
    ],
  },
});
```

**Limits checked locally:**

- `text` is 1-4096 characters. Telegram counts UTF-16 code units **after**
  entity parsing; the local check runs before parsing and counts the raw
  string's UTF-16 code units (`text.length`, so an emoji counts as 2).
  Without `parse_mode` the counts agree. With `parse_mode` the markup also
  counts locally, so text whose tags push it past 4096 is refused here even
  if Telegram would accept it. Split long formatted messages well below the
  limit.
- Each inline keyboard button needs **exactly one** action: `url`,
  `callback_data`, `web_app`, `login_url`, `switch_inline_query`,
  `switch_inline_query_current_chat`, `switch_inline_query_chosen_chat`,
  `copy_text`, `callback_game` or `pay`. `url` must be `http(s)://` or
  `tg://`.
- `callback_data` is 1-64 **bytes** of UTF-8, not characters: 64 ASCII
  characters fit, but only 32 Cyrillic letters or 16 emoji.

### `editMessageText()` and `editMessageReplyMarkup()`

```ts
const edited = await client.editMessageText({
  chat_id: -1001234567890,
  message_id: 42,
  text: 'Abuse report 17: resolved by @ada',
});
if (edited !== true) console.log(edited.edit_date);

// Replace the buttons only; leave out reply_markup to remove them.
await client.editMessageReplyMarkup({
  chat_id: -1001234567890,
  message_id: 42,
  reply_markup: {
    inline_keyboard: [[{ text: 'Reopen', callback_data: 'reopen:17' }]],
  },
});
```

Target either `chat_id` + `message_id` (a message the bot sent to a chat)
or `inline_message_id` (a message sent via the bot in inline mode), never
both. Telegram returns the edited `Message` for the first and `true` for
the second, so the result type is `Message | true`. Only an inline keyboard
can be attached to an edited message. Editing a message to the text and
markup it already has fails with a `BAD_REQUEST` ("message is not
modified").

### `answerCallbackQuery()`

```ts
await client.answerCallbackQuery({
  callback_query_id: '4382bfdwdsb323b2d9',
  text: 'Muted Ops alerts for 1 hour', // 0-200 characters
  show_alert: false,
  cache_time: 0,
});
```

Answer every callback query, even without `text`: the user's client shows
a progress indicator on the button until you do.

### `deleteMessage()`

```ts
await client.deleteMessage({ chat_id: -1001234567890, message_id: 42 });
```

Telegram refuses (`BAD_REQUEST`) to delete a message older than 48 hours,
and in groups and channels the bot needs the matching administrator rights.

### `setWebhook()`, `deleteWebhook()`, `getWebhookInfo()`

```ts
await client.setWebhook({
  url: 'https://bot.example.com/telegram',
  secret_token: 'a-long-random-value-from-your-secret-store',
  allowed_updates: ['message', 'callback_query', 'my_chat_member'],
  max_connections: 40,
  drop_pending_updates: false,
});

const info = await client.getWebhookInfo();
if (info.last_error_message) {
  console.warn(info.last_error_date, info.last_error_message);
}

await client.deleteWebhook({ drop_pending_updates: true });
```

- `url` must be `https:` on port 443, 80, 88 or 8443, the ports Telegram
  delivers webhooks to. Remove a webhook with `deleteWebhook()` rather than
  an empty URL.
- `secret_token` is **required** here, though Telegram treats it as
  optional: without it, anyone who learns the URL can post forged updates.
  It must be 1-256 characters of `A-Z`, `a-z`, `0-9`, `_` and `-`, and it is
  never repeated in an error.
- `max_connections` is 1-100 (Telegram defaults to 40).
- `allowed_updates` takes the documented kinds (`UPDATE_TYPES`). An empty
  list means every kind except `chat_member`, `message_reaction` and
  `message_reaction_count`; leaving it out keeps the previous setting.
- Uploading a self-signed `certificate` needs a multipart upload and is not
  supported.

### `setMyCommands()`, `getMyCommands()`, `deleteMyCommands()`

```ts
await client.setMyCommands({
  commands: [
    { command: 'status', description: 'Service status' },
    { command: 'flagged', description: 'Links flagged for review' },
  ],
  scope: { type: 'chat_administrators', chat_id: -1001234567890 },
  language_code: 'en',
});

const commands = await client.getMyCommands({
  scope: { type: 'chat_administrators', chat_id: -1001234567890 },
  language_code: 'en',
});

await client.deleteMyCommands({ scope: { type: 'all_group_chats' } });
```

`command` is 1-32 lowercase letters, digits and underscores, without the
leading `/`; `description` is 1-256 characters; at most 100 commands.
`scope` is one of:

| `type`                    | Extra fields         | Applies to                                   |
| ------------------------- | -------------------- | -------------------------------------------- |
| `default`                 | —                    | Everyone without a narrower scope            |
| `all_private_chats`       | —                    | Every private chat                           |
| `all_group_chats`         | —                    | Every group and supergroup                   |
| `all_chat_administrators` | —                    | Administrators of every group and supergroup |
| `chat`                    | `chat_id`            | One chat                                     |
| `chat_administrators`     | `chat_id`            | Administrators of one group or supergroup    |
| `chat_member`             | `chat_id`, `user_id` | One member of one group or supergroup        |

Telegram shows a user the list from the narrowest scope (and language) that
has one set; deleting a list makes the next broader one show.

### `getMe()`

```ts
const me = await client.getMe();
console.log(me.username, me.can_join_groups);
```

Takes no parameters. A simple way to confirm a configured bot token is live
and see what the bot is permitted to do (join groups, read all group
messages, use inline queries, …). `me.username` is what to pass to
`Telegram.parseCommand`.

## Webhook bots

Updates arrive as HTTPS POSTs to the webhook URL, one `Update` per request.
Long polling (`getUpdates`) is not implemented.

### `Telegram.verifyWebhookRequest()`

```ts
declare const request: Request;
declare const env: { TELEGRAM_WEBHOOK_SECRET: string };

const update = Telegram.verifyWebhookRequest({
  headers: request.headers, // a Headers instance or a plain object
  body: await request.text(), // the raw body: text(), never json()
  secretToken: env.TELEGRAM_WEBHOOK_SECRET,
});
```

It runs these checks, in order, and parses nothing until the secret
matches:

1. `secretToken` must itself be a valid `secret_token`, or it throws
   `CONFIG_INVALID_WEBHOOK_SECRET`. This keeps an unset secret (an empty
   string from a missing environment variable) from matching a request that
   has no header.
2. The `X-Telegram-Bot-Api-Secret-Token` header (looked up
   case-insensitively; exported as `WEBHOOK_SECRET_HEADER`) must be present
   (`WEBHOOK_SECRET_MISSING`) and equal `secretToken`
   (`WEBHOOK_SECRET_INVALID`). The comparison uses `constantTimeEqual` from
   `@tundralibs/crypt`, so its timing does not reveal how much of the secret
   matched. A header longer than 256 characters is refused without
   comparing.
3. The body must be JSON (`WEBHOOK_MALFORMED_BODY`) shaped like an `Update`
   (`WEBHOOK_INVALID_UPDATE`).

Neither the configured secret nor the received header value appears in any
error. Answer the two secret errors with `401`. For the two body errors,
log and answer `200`: Telegram redelivers on any non-2xx status, and a body
that failed to parse once will fail every time.

Updates of kinds this package doesn't model (`poll`, `message_reaction`, …)
and fields it doesn't know parse without error; read them through a
`Record<string, unknown>` cast. A modeled kind whose required fields are
missing (a `message` without `chat`) does fail.

### `Telegram.updateKind()`

```ts
declare const update: import('@tundraconnect/telegram/schemas').UpdateSchema;

switch (Telegram.updateKind(update)) {
  case 'message':
    console.log(update.message?.text);
    break;
  case 'callback_query':
    console.log(update.callback_query?.data);
    break;
  case 'my_chat_member':
    // 'kicked' in a private chat: the user blocked the bot.
    console.log(update.my_chat_member?.new_chat_member.status);
    break;
  default:
    break; // another documented kind, or 'unknown'
}
```

A callback query's `message` may be an **inaccessible** message (deleted, or
too old) with `date: 0` and only `chat` and `message_id`; check
`message.date === 0` before reading anything else. `callback_query.data`
comes from the user's client, so treat it as untrusted input.

### `Telegram.parseCommand()`

```ts
Telegram.parseCommand('/today'); // { command: 'today', args: [], rawArgs: '' }
Telegram.parseCommand('/ORG@BrevilyBot  acme   corp', 'brevilybot');
// { command: 'org', args: ['acme', 'corp'], rawArgs: 'acme   corp', botUsername: 'BrevilyBot' }
Telegram.parseCommand('/org@OtherBot acme', 'BrevilyBot'); // null
Telegram.parseCommand('hello'); // null
```

- Pass the message itself when you have it. If its `entities` array is
  present, the `bot_command` entity at offset 0 decides what the command is,
  and a message without one is not a command. Otherwise the text is parsed:
  `/`, then letters, digits and underscores, optionally `@BotName`, then
  whitespace or the end (`/status-x` is not a command).
- The command is lowercased; users can type `/Status`, but `setMyCommands`
  only allows lowercase.
- `botUsername` (e.g. `me.username` from `getMe()`, with or without `@`) is
  compared case-insensitively. A command addressed to another bot returns
  `null`; one addressed to no bot is always accepted.
- `args` is the rest of the text split on whitespace; `rawArgs` is the same
  text trimmed but unsplit.
- It does not authorize. Check `message.from?.id` or `message.chat.id`
  before acting on a command.

See [Errors](Telegram-Errors.md) for failure handling and
[Schemas](Telegram-Schemas.md) for request/response validation.

---

[← Back to Telegram](../README.md)
