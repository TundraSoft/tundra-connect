# Discord API

## Configuration

`Discord` accepts a discriminated-by-shape configuration: EITHER a webhook
OR a bot token, never both, never neither. Which fields are present decides
the mode; an incomplete/ambiguous/empty configuration throws immediately at
construction (see [Errors](Discord-Errors.md)).

```ts
import { Discord } from '@tundraconnect/discord';

// Webhook mode — by full URL
const webhookClient = new Discord({
  webhookUrl: 'https://discord.com/api/webhooks/123456789012345678/abcDEF...',
});

// Webhook mode — by id + token (equivalent to the URL above)
const webhookClient2 = new Discord({
  webhookId: '123456789012345678',
  webhookToken: 'abcDEF...',
});

// Bot mode
const botClient = new Discord({ botToken: 'your-bot-token' });
```

Both modes share Discord's versioned base URL, `https://discord.com/api/v10`.
In bot mode, `botToken` is sent as `Authorization: Bot {token}` on every
request (Discord's bot tokens use the literal `Bot` prefix, not `Bearer`).
In webhook mode, no `Authorization` header is sent at all — the webhook id

- token is the credential, embedded directly in the request path.

In id + token mode, `webhookId` must be a Discord snowflake ID (a 17-20
digit numeric string) and `webhookToken` a single URL path segment (no
`/`, `?`, or `#`, and not `.` or `..`) — exactly the shapes the
`webhookUrl` pattern enforces on the same two values. Both are embedded in
the request path, so a value that would splice or retarget the URL throws
`CONFIG_INVALID_WEBHOOK_ID` / `CONFIG_INVALID_WEBHOOK_TOKEN` at
construction instead of silently diverging the request.

Use `client.mode` (`'webhook'` | `'bot'`) to read back which mode a client
was configured for.

## Endpoints

| Method                                   | Endpoint                              | Result                                                               |
| ---------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `sendWebhookMessage(message, params?)`   | `POST /webhooks/{id}/{token}`         | `undefined` by default, or the created Message with `{ wait: true }` |
| `sendChannelMessage(channelId, message)` | `POST /channels/{channelId}/messages` | The created Message resource                                         |

Calling `sendWebhookMessage()` on a bot-mode client (or `sendChannelMessage()`
on a webhook-mode client) throws `DiscordError('MODE_MISMATCH', ...)`
immediately, without making a request.

### `sendWebhookMessage(message, params?)`

```ts
import { Discord } from '@tundraconnect/discord';

const client = new Discord({
  webhookUrl: 'https://discord.com/api/webhooks/123456789012345678/abcDEF...',
});

// Discord's own default (params.wait omitted/false): 204 No Content.
await client.sendWebhookMessage({ content: 'Deploy succeeded' });

// params.wait: true — Discord waits for the message and returns it.
const message = await client.sendWebhookMessage(
  { content: 'Deploy succeeded' },
  { wait: true },
);
console.log(message?.id);

// params.threadId — post into a thread on the webhook's channel.
await client.sendWebhookMessage(
  { content: 'Deploy succeeded' },
  { threadId: '987654321098765432' },
);
```

`username`/`avatar_url` are valid here (they override the webhook's
configured identity for this one message) but are **not** accepted by
`sendChannelMessage()` — Discord only honors them on webhook execution.

### `sendChannelMessage(channelId, message)`

```ts
import { Discord } from '@tundraconnect/discord';

const client = new Discord({ botToken: 'your-bot-token' });

const message = await client.sendChannelMessage('234567890123456789', {
  content: 'Deploy succeeded',
  embeds: [{ title: 'Build #482', color: 0x57f287 }],
});
console.log(message.id, message.timestamp);
```

`message_reference` (for replies) is valid here but not on
`sendWebhookMessage()`.

Both methods require at least one of `content`/`embeds` — Discord's own
"at least one of content/embeds/components/files/poll" rule, narrowed to
this connect's scope (file uploads, components, stickers, and polls are
not modelled). This is validated locally, before any request is sent. See
[Errors](Discord-Errors.md) for failure handling and
[Schemas](Discord-Schemas.md) for the full option list.

---

[← Back to Discord](../README.md)
