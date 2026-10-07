# Telegram

Typed [Telegram Bot API](https://core.telegram.org/bots/api) client for Deno,
Bun, Node.js and Cloudflare Workers, built for webhook bots. Send, edit and
delete messages with inline keyboards, answer callback queries, manage the
webhook and the bot's command menu, and verify and parse incoming webhook
updates and `/commands`. It uses the bot HTTPS API only, not MTProto,
Telegram's much heavier client protocol.

[![JSR](https://jsr.io/badges/@tundraconnect/telegram)](https://jsr.io/@tundraconnect/telegram)
[![JSR Score](https://jsr.io/badges/@tundraconnect/telegram/score)](https://jsr.io/@tundraconnect/telegram)

## Overview

Telegram authenticates a bot by embedding its token directly in the request
path (`https://api.telegram.org/bot<token>/<method>`) rather than a header
or query parameter, and wraps every response — success or failure — in a
universal `{ ok, result, error_code, description, parameters }` envelope.
This client validates each request locally before sending it, unwraps that
envelope, and throws a typed `TelegramError` on failure. It uses RESTler for
transport and Guardian for runtime request/response validation.

| Area          | Methods                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| Messages      | `sendMessage`, `editMessageText`, `editMessageReplyMarkup`, `deleteMessage`     |
| Callbacks     | `answerCallbackQuery`                                                           |
| Webhook       | `setWebhook`, `deleteWebhook`, `getWebhookInfo`                                 |
| Command menu  | `setMyCommands`, `getMyCommands`, `deleteMyCommands`                            |
| Bot           | `getMe`                                                                         |
| Static helper | `Telegram.verifyWebhookRequest`, `Telegram.updateKind`, `Telegram.parseCommand` |

Updates arrive over a webhook only; long polling (`getUpdates`) is not
implemented.

```ts
import { Telegram } from '@tundraconnect/telegram';

const client = new Telegram({ botToken: '123456789:AAExampleToken' });

const me = await client.getMe();
console.log(me.username);
```

## Testing your code

Your tests don't need to fake HTTP. Have your code take a `Telegram` instance
and pass in a stand-in that returns the shapes from
`@tundraconnect/telegram/schemas` or throws a real `TelegramError`:

```ts
import { TelegramError } from '@tundraconnect/telegram/errors';

const outage = new TelegramError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(outage.code);
```

To exercise the client itself against a fake transport, subclass it and
reassign the protected `_fetch`. `Telegram.verifyWebhookRequest` and
`Telegram.parseCommand` are pure and need no client at all.

## Documentation

| Topic                                                                         | Description                                          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/Telegram-API)         | Client configuration, endpoint methods, webhook bots |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/Telegram-Errors)   | Error codes and diagnostic metadata                  |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/Telegram-Schemas) | Public Guardian schemas and inferred types           |

## Upstream

- [Telegram Bot API reference](https://core.telegram.org/bots/api)
- [Create a bot with @BotFather](https://t.me/BotFather) — message `/newbot`
  to get a bot token, in the `123456789:AA...` form this client expects as
  `botToken`.

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/telegram
```

**Bun:**

```sh
bunx jsr add @tundraconnect/telegram
```

**Node.js:**

```sh
npx jsr add @tundraconnect/telegram
```

## Quick Start

### Send an alert with buttons

```ts continued
const alert = await client.sendMessage({
  chat_id: -1001234567890,
  text: '<b>Abuse report</b> for <code>brev.ly/x7Kq</code>',
  parse_mode: 'HTML',
  link_preview_options: { is_disabled: true },
  reply_markup: {
    inline_keyboard: [[
      { text: 'Open report', url: 'https://example.com/abuse/17' },
      { text: 'Acknowledge', callback_data: 'ack:abuse:17' },
    ]],
  },
});

// Later: update the text. Leaving out reply_markup drops the buttons.
await client.editMessageText({
  chat_id: alert.chat.id,
  message_id: alert.message_id,
  text: 'Abuse report 17: acknowledged',
});
```

Every inline button needs exactly one action (`url`, `callback_data`, …),
and `callback_data` is limited to 64 **bytes** of UTF-8, not 64 characters.
Message text is limited to 4096 characters; with `parse_mode` the local
check also counts the markup, so it is stricter than Telegram's own count.

### Register the webhook and the command menu

Run this once from a deploy script, not on every request:

```ts continued
await client.setWebhook({
  url: 'https://bot.example.com/telegram',
  secret_token: 'a-long-random-value-from-your-secret-store',
  allowed_updates: ['message', 'callback_query', 'my_chat_member'],
});

await client.setMyCommands({
  commands: [
    { command: 'status', description: 'Service status' },
    { command: 'today', description: "Today's totals" },
    { command: 'help', description: 'What this bot can do' },
  ],
});
```

`secret_token` is required here (Telegram treats it as optional), so every
webhook set up with this package can be verified.

### Handle updates in a Cloudflare Worker

Telegram POSTs each update to the webhook URL with the secret in the
`X-Telegram-Bot-Api-Secret-Token` header. `verifyWebhookRequest` compares it
in constant time, then parses the body into a typed `Update`;
`parseCommand` turns `/today@YourBot acme` into `{ command, args }`.

```ts
import { Telegram, TelegramError } from '@tundraconnect/telegram';

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_BOT_USERNAME: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let update;
    try {
      update = Telegram.verifyWebhookRequest({
        headers: request.headers,
        body: await request.text(), // the raw body: text(), never json()
        secretToken: env.TELEGRAM_WEBHOOK_SECRET,
      });
    } catch (err) {
      if (!(err instanceof TelegramError)) throw err;
      if (
        err.code === 'WEBHOOK_SECRET_MISSING' ||
        err.code === 'WEBHOOK_SECRET_INVALID'
      ) {
        return new Response(null, { status: 401 });
      }
      if (
        err.code === 'WEBHOOK_MALFORMED_BODY' ||
        err.code === 'WEBHOOK_INVALID_UPDATE'
      ) {
        // Telegram redelivers on any non-2xx, and this body will never
        // parse: log it and acknowledge.
        console.error(err.message);
        return new Response(null, { status: 200 });
      }
      throw err; // CONFIG_INVALID_WEBHOOK_SECRET: fix the deployment
    }

    const client = new Telegram({ botToken: env.TELEGRAM_BOT_TOKEN });

    const message = update.message;
    const command = message &&
      Telegram.parseCommand(message, env.TELEGRAM_BOT_USERNAME);
    if (message && command) {
      // parseCommand does not authorize: check message.from?.id or
      // message.chat.id against your own allow-list before answering.
      if (command.command === 'status') {
        await client.sendMessage({
          chat_id: message.chat.id,
          text: 'All systems normal.',
          reply_parameters: { message_id: message.message_id },
        });
      }
    }

    const query = update.callback_query;
    if (query) {
      // Always answer, even silently: the button spins until you do.
      await client.answerCallbackQuery({
        callback_query_id: query.id,
        text: 'Acknowledged',
      });
    }

    return new Response(null, { status: 200 });
  },
};
```

`Telegram.updateKind(update)` names the kind (`'message'`,
`'callback_query'`, `'my_chat_member'`, …, or `'unknown'`) when you prefer a
`switch`. Updates of kinds this package doesn't model, and fields it doesn't
know, parse without error.

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
