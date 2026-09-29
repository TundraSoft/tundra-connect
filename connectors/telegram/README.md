# Telegram

Typed [Telegram Bot API](https://core.telegram.org/bots/api) client for Deno,
Bun, Node.js and Cloudflare Workers. Send messages and fetch the bot's own
identity over the bot HTTPS API. It does not implement MTProto, Telegram's much
heavier client protocol.

[![JSR](https://jsr.io/badges/@tundraconnect/telegram)](https://jsr.io/@tundraconnect/telegram)
[![JSR Score](https://jsr.io/badges/@tundraconnect/telegram/score)](https://jsr.io/@tundraconnect/telegram)

## Overview

Telegram authenticates a bot by embedding its token directly in the request
path (`https://api.telegram.org/bot<token>/<method>`) rather than a header
or query parameter, and wraps every response — success or failure — in a
universal `{ ok, result, error_code, description, parameters }` envelope.
This client validates and sends `sendMessage()` requests and unwraps that
envelope automatically, throwing a typed `TelegramError` on failure. It
uses RESTler for transport and Guardian for runtime request/response
validation.

## Documentation

| Topic                                                                         | Description                                |
| ----------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/Telegram-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/Telegram-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/Telegram-Schemas) | Public Guardian schemas and inferred types |

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

```ts
import { Telegram } from '@tundraconnect/telegram';

const client = new Telegram({ botToken: '123456789:AAExampleToken' });

const me = await client.getMe();
console.log(me.username);

const message = await client.sendMessage({
  chat_id: '@examplechannel',
  text: 'Deployment finished successfully.',
});

console.log(message.message_id);
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
