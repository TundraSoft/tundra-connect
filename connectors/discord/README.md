# Discord

Typed [Discord API](https://discord.com/developers/docs/intro) client for Deno,
Bun, Node.js and Cloudflare Workers, scoped to sending notification messages
into a channel through a channel **webhook** or the **bot** REST API, and to
verifying Ed25519-signed interaction webhooks. It needs no Gateway connection,
so it suits alerts and notifications where `discord.js` would be more than you
need.

[![JSR](https://jsr.io/badges/@tundraconnect/discord)](https://jsr.io/@tundraconnect/discord)
[![JSR Score](https://jsr.io/badges/@tundraconnect/discord/score)](https://jsr.io/@tundraconnect/discord)

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

| Topic                                                                        | Description                                |
| ---------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/Discord-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/Discord-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/Discord-Schemas) | Public Guardian schemas and inferred types |

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

## Interactions

```ts
import { Discord } from '@tundraconnect/discord';

const client = new Discord({
  webhookUrl: 'https://discord.com/api/webhooks/123456789012345678/abcDEF...',
});

export async function onInteraction(req: Request): Promise<void> {
  const raw = await req.text(); // text(), never json()
  const interaction = await client.verifyWebhook({
    payload: raw,
    headers: req.headers,
    publicKey: 'your-application-public-key',
  });
  // `interaction` is now trustworthy.
}
```

See [API → Webhooks](https://github.com/TundraSoft/tundra-connect/wiki/Discord-API#webhooks).

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
