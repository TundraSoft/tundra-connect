# Discord Schemas

The `@tundraconnect/discord/schemas` subpath exports Guardian validators
and inferred types. `sendWebhookMessage()`/`sendChannelMessage()` validate
their input before sending, and validate the response body before
returning it.

```ts
import {
  type WebhookMessageRequestSchema,
  WebhookMessageRequestSchemaObject,
} from '@tundraconnect/discord/schemas';

const payload: unknown = { content: 'Deploy succeeded' };

const [error, options] = WebhookMessageRequestSchemaObject.safeParse(payload);
if (error || !options) throw error;

const typedOptions: WebhookMessageRequestSchema = options;
console.log(typedOptions.content);
```

## Request Schemas

| Schema                              | Purpose                                            |
| ----------------------------------- | -------------------------------------------------- |
| `WebhookMessageRequestSchemaObject` | Options accepted by `Discord.sendWebhookMessage()` |
| `ChannelMessageRequestSchemaObject` | Options accepted by `Discord.sendChannelMessage()` |

Both require at least one of `content`/`embeds`, and reject `embeds` whose
combined text exceeds Discord's documented 6000-character budget across
all embeds in the message (`embedsWithinCharacterBudget()`, from the Embed
schema, backs this check). `WebhookMessageRequestSchemaObject` additionally
accepts `username`/`avatar_url`/`thread_name` (webhook-only);
`ChannelMessageRequestSchemaObject` additionally accepts
`message_reference` (bot-only, for replies). File uploads, message
components, stickers, and polls are out of scope for this connect and are
not modelled by either schema.

## Shared Schema

| Schema              | Purpose                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `EmbedSchemaObject` | A Discord embed object — identical shape on both the webhook and the bot API, and reused for the `embeds` field of the response Message. |

`EmbedSchemaObject` enforces Discord's documented per-field limits
(`title` ≤ 256, `description` ≤ 4096, up to 25 `fields`, `field.name` ≤
256, `field.value` ≤ 1024, `footer.text` ≤ 2048, `author.name` ≤ 256,
`color` a 24-bit integer). `EMBED_TOTAL_CHARACTER_LIMIT` (`6000`) and
`embedsWithinCharacterBudget()` are exported for reuse.

## Response Schemas

| Schema                  | Endpoint                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `MessageSchemaObject`   | `POST /channels/{id}/messages`, and `POST /webhooks/{id}/{token}` with `?wait=true` |
| `ErrorSchemaObject`     | Vendor error envelopes (`{ code, message, errors? }`) on non-2xx responses          |
| `RateLimitSchemaObject` | The `429` rate-limit body (`{ message, retry_after, global, code? }`)               |

`MessageSchemaObject` models the fields relevant to a just-sent message
(`id`, `channel_id`, `author`, `content`, `timestamp`, `embeds`,
`attachments`, ...) and `.passthrough()`es the rest — Discord's full
Message resource carries many more feature-specific fields (polls,
threads, interactions, ...) that grow over time.

## Common Validators

`snowflakeGuard` validates a Discord snowflake ID (channel/message/
webhook/user IDs); `webhookUrlGuard` validates a full execute-webhook URL
and `parseWebhookUrl()` splits one into its `{ id, token }` parts;
`webhookTokenGuard` validates a webhook token supplied on its own (id +
token mode) as a single URL path segment — the same character class the
webhook URL pattern enforces on its token portion;
`AllowedMentionsSchemaObject` validates the `allowed_mentions` object
shared by both request schemas.

---

[← Back to Discord](../README.md)
