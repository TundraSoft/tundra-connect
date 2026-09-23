# Slack API

## Configuration

```ts
import { Slack } from '@tundraconnect/slack';

const client = new Slack({
  auth: { type: 'BEARER', token: 'xoxb-your-bot-token' },
  timeout: 10,
});
```

`auth` is required and must be `{ type: 'BEARER', token, prefix? }` — the
client throws `SlackError` (`CONFIG_INVALID_TOKEN`) at construction if it's
missing, isn't `type: 'BEARER'`, or its `token` is blank or not a string.
`auth.token` is sent as `Authorization: <prefix> <token>` on every request,
via RESTler's built-in Bearer auth support (no custom auth handling needed)
— pass `prefix: 'Bearer'` to match Slack's documented casing (RESTler
otherwise defaults to `BEARER`). `timeout` is expressed in seconds and
defaults to `10`.

Create a bot token from your app's **OAuth & Permissions** page at
https://api.slack.com/apps (or the newer app-management UI linked from
https://docs.slack.dev/quickstart) after installing the app to a workspace
— it looks like `xoxb-...`. Grant it the scopes each method below needs
(`chat:write`, `channels:read`/`groups:read`, `channels:history`/
`groups:history`, `users:read`, ...).

## Endpoints

| Method                     | Endpoint                     | Result                                              |
| -------------------------- | ---------------------------- | --------------------------------------------------- |
| `postMessage()`            | `POST /chat.postMessage`     | Sends a message; returns `{ channel, ts, message }` |
| `updateMessage()`          | `POST /chat.update`          | Edits a message's text                              |
| `deleteMessage()`          | `POST /chat.delete`          | Deletes a message                                   |
| `listConversations()`      | `GET /conversations.list`    | Paginated list of visible conversations             |
| `getConversationHistory()` | `GET /conversations.history` | Paginated message history for one conversation      |
| `getUserInfo()`            | `GET /users.info`            | Looks up one user by id                             |

### `postMessage()`

```ts
const sent = await client.postMessage({
  channel: 'C123ABC456',
  text: 'Deploy succeeded',
  thread_ts: '1503435956.000247', // optional: reply in a thread
});
console.log(sent.ts);
```

`text` is required. Slack also accepts rich `blocks`/`attachments`
payloads (Block Kit) — that's out of scope for this connect's v1 schema;
`text` is sent as-is and doubles as the accessibility/notification
fallback Slack itself requires alongside `blocks`. See
[Schemas](Slack-Schemas.md) for the full set of optional fields
(`unfurl_links`, `unfurl_media`, `reply_broadcast`, `mrkdwn`, `parse`,
`username`, `icon_emoji`, `icon_url`).

### `updateMessage()` / `deleteMessage()`

```ts
await client.updateMessage({
  channel: 'C123ABC456',
  ts: '1401383885.000061',
  text: 'Updated text you carefully authored',
});

await client.deleteMessage({ channel: 'C123ABC456', ts: '1401383885.000061' });
```

With a bot token, both can only act on a message the bot itself posted.

### `listConversations()` / `getConversationHistory()`

Both are cursor-paginated: pass the previous page's
`response_metadata.next_cursor` back as `cursor` to fetch the next one; an
absent/empty `next_cursor` means there is no further page.

```ts
let cursor: string | undefined;
do {
  const page = await client.listConversations({ cursor, limit: 200 });
  console.log(page.channels.map((c) => c.name));
  cursor = page.response_metadata?.next_cursor || undefined;
} while (cursor);

const { messages, has_more } = await client.getConversationHistory({
  channel: 'C123ABC456',
  limit: 50,
});
```

### `getUserInfo()`

```ts
const { user } = await client.getUserInfo('U123ABC456');
console.log(user.real_name, user.profile?.email);
```

See [Errors](Slack-Errors.md) for failure handling — including Slack's
`{ ok: false, error }` convention, which is unlike every other status-code
based connect in this repository — and [Schemas](Slack-Schemas.md) for
request/response validation.

---

[← Back to Slack](../README.md)

## Webhooks

### `verifyWebhook(options)`

Verifies an inbound webhook from Slack — a method on the client, not an HTTP call.

**Scheme** (`X-Slack-Signature` + `X-Slack-Request-Timestamp`): basestring `v0:<timestamp>:<rawBody>`, HMAC-SHA256 with the app's Signing Secret as UTF-8, hex, presented as `v0=<hex>`. Five-minute replay window.

| Option             | Type                | Required | Description                                                                               |
| ------------------ | ------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `payload`          | `string`            | yes      | Raw body before any deserialization — JSON (Events API) or form-encoded (slash commands). |
| `headers`          | `Headers \| object` | yes      | Case-insensitive lookup.                                                                  |
| `signingSecret`    | `string`            | yes      | The app's Signing Secret.                                                                 |
| `toleranceSeconds` | `number`            | no       | Replay window. Default `300`.                                                             |
| `nowMs`            | `number`            | no       | Clock override for tests.                                                                 |

**Returns:** The **raw body string** once trusted — Slack bodies are JSON _or_ form-encoded depending on the feature, so parse it yourself afterwards.

**Throws:** `SlackError` with `WEBHOOK_INVALID_HEADERS`, `WEBHOOK_TIMESTAMP_INVALID`, `WEBHOOK_SIGNATURE_INVALID`.

```ts
const raw = await req.text(); // text(), never json()
const body = await client.verifyWebhook({
  payload: raw,
  headers: req.headers,
  signingSecret: SLACK_SIGNING_SECRET,
});
```

Comparison is constant-time via `@tundralibs/crypt`. Treat `WEBHOOK_SIGNATURE_INVALID` as a forged request.
