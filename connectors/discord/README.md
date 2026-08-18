# Discord

Typed, cross-runtime client for the [Discord API](https://discord.com/developers/docs/intro), scoped to sending notification messages into a channel — via a channel **webhook** or the **bot** REST API.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

Discord supports two structurally different ways to post a message into a
channel, and this connect covers both:

- **Webhook mode** — a per-channel URL
  (`https://discord.com/api/webhooks/{id}/{token}`) that needs no
  `Authorization` header at all; the id + token embedded in the URL/path
  _is_ the credential. `sendWebhookMessage()` calls
  `POST /webhooks/{id}/{token}`.
- **Bot mode** — a bot token sent as `Authorization: Bot {token}`.
  `sendChannelMessage()` calls `POST /channels/{channelId}/messages`.

A single `Discord` client is configured for exactly one of these modes —
never both, never neither — validated at construction time. It uses
RESTler for transport and Guardian for runtime request/response
validation.

## Documentation

| Topic                              | Description                                |
| ---------------------------------- | ------------------------------------------ |
| [API](docs/Discord-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/Discord-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/Discord-Schemas.md) | Public Guardian schemas and inferred types |

## Upstream

- [Discord Developer Documentation](https://discord.com/developers/docs/intro)
- [Execute Webhook](https://discord.com/developers/docs/resources/webhook#execute-webhook)
- [Create Message](https://discord.com/developers/docs/resources/message#create-message)
- [Create a Discord application](https://discord.com/developers/applications)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/discord
```

**Bun:**

```sh
bunx jsr add @tundraconnect/discord
```

**Node.js:**

```sh
npx jsr add @tundraconnect/discord
```

## Quick Start

### Webhook mode

```ts
import { Discord } from '@tundraconnect/discord';

const client = new Discord({
  webhookUrl: 'https://discord.com/api/webhooks/123456789012345678/abcDEF...',
});

// Discord's own default: fire-and-forget, resolves to `undefined`.
await client.sendWebhookMessage({ content: 'Deploy succeeded' });

// Pass `{ wait: true }` to get the created message back.
const message = await client.sendWebhookMessage(
  {
    content: 'Deploy succeeded',
    embeds: [{ title: 'Build #482', color: 0x57f287 }],
  },
  { wait: true },
);
console.log(message?.id);
```

### Bot mode

```ts
import { Discord } from '@tundraconnect/discord';

const client = new Discord({ botToken: 'your-bot-token' });

const message = await client.sendChannelMessage('234567890123456789', {
  content: 'Deploy succeeded',
});
console.log(message.id, message.timestamp);
```

## License

MIT
