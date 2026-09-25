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

| Method          | Endpoint            | Result               |
| --------------- | ------------------- | -------------------- |
| `sendMessage()` | `POST /sendMessage` | The sent `Message`   |
| `getMe()`       | `GET /getMe`        | The bot's own `User` |

### `sendMessage()`

```ts
import { Telegram } from '@tundraconnect/telegram';

const client = new Telegram({ botToken: '123456789:AAExampleToken' });

const message = await client.sendMessage({
  chat_id: '@examplechannel', // or an integer chat id
  text: 'Deployment finished successfully.',
});

console.log(message.message_id, message.chat.type);
```

The request is validated against `SendMessageRequestSchema` before it's
sent — see [Schemas](Telegram-Schemas.md). `chat_id` accepts either the
chat's integer id or an `@username` string (public channels/supergroups
only). `parse_mode` (`'MarkdownV2' | 'HTML' | 'Markdown'`) formats `text`;
it's mutually exclusive with `entities` per Telegram's own docs, but that
cross-field rule isn't enforced locally — an invalid combination surfaces
as a `400 Bad Request` from Telegram itself. `reply_markup`,
`reply_parameters`, and `link_preview_options` are validated only as
plain objects (passed through as-is) — full inline/reply-keyboard modeling
is out of scope for this MVP.

```ts
// Reply to a specific message with inline formatting
await client.sendMessage({
  chat_id: 123456789,
  text: '*Bold* and _italic_ text\\.',
  parse_mode: 'MarkdownV2',
  reply_parameters: { message_id: 42 },
  disable_notification: true,
});
```

### `getMe()`

```ts
const me = await client.getMe();
console.log(me.username, me.can_join_groups);
```

Takes no parameters. A simple way to confirm a configured bot token is live
and see what the bot is permitted to do (join groups, read all group
messages, use inline queries, …).

See [Errors](Telegram-Errors.md) for failure handling and
[Schemas](Telegram-Schemas.md) for request/response validation.

---

[← Back to Telegram](../README.md)
