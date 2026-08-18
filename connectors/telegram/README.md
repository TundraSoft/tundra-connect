# Telegram

Typed, cross-runtime client for the [Telegram Bot API](https://core.telegram.org/bots/api) — the simple bot HTTPS API only, not Telegram's much heavier MTProto client protocol.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers & Browser](https://img.shields.io/badge/Cloudflare_Workers_%26_Browser-compatible-orange?logo=cloudflareworkers)

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

| Topic                               | Description                                |
| ----------------------------------- | ------------------------------------------ |
| [API](docs/Telegram-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/Telegram-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/Telegram-Schemas.md) | Public Guardian schemas and inferred types |

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

MIT
