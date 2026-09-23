# Discord Errors

Discord throws `DiscordError` for invalid configuration, local request
validation failures, documented vendor responses, and malformed payloads.

```ts
import { DiscordError, DiscordErrorCodes } from '@tundraconnect/discord/errors';

const error = new DiscordError('EMPTY_MESSAGE', { status: 400 });
console.log(error.message);
console.log(DiscordErrorCodes.EMPTY_MESSAGE);
```

## Codes

| Code                           | Meaning                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `CONFIG_MISSING_CREDENTIALS`   | Neither a webhook nor a `botToken` was supplied.                                      |
| `CONFIG_AMBIGUOUS_CREDENTIALS` | More than one integration mode was supplied.                                          |
| `CONFIG_INCOMPLETE_WEBHOOK`    | Only one of `webhookId` / `webhookToken` was supplied.                                |
| `CONFIG_INVALID_WEBHOOK_ID`    | `webhookId` isn't a Discord snowflake ID (17-20 digit numeric string).                |
| `CONFIG_INVALID_WEBHOOK_TOKEN` | `webhookToken` isn't a single URL path segment (`/`, `?`, `#`, `.`, `..` rejected).   |
| `CONFIG_INVALID_WEBHOOK_URL`   | `webhookUrl` doesn't match Discord's documented webhook URL shape.                    |
| `CONFIG_INVALID_BOT_TOKEN`     | `botToken` is present but not a non-empty string.                                     |
| `REQUEST_VALIDATION_ERROR`     | `sendWebhookMessage()`/`sendChannelMessage()` input failed local Guardian validation. |
| `MODE_MISMATCH`                | Called a webhook-only method on a bot-mode client, or vice versa.                     |
| `GENERAL_ERROR`                | Discord error 0 — general/malformed request body.                                     |
| `UNKNOWN_CHANNEL`              | Discord error 10003 — the channel doesn't exist or isn't visible.                     |
| `UNKNOWN_MESSAGE`              | Discord error 10008 — referenced message doesn't exist.                               |
| `UNKNOWN_WEBHOOK`              | Discord error 10015 — the webhook has likely been deleted.                            |
| `MISSING_ACCESS`               | Discord error 50001 — the bot can't see this resource.                                |
| `EMPTY_MESSAGE`                | Discord error 50006 — no `content`/`embeds`/etc. were sent.                           |
| `CANNOT_MESSAGE_USER`          | Discord error 50007 — can't DM this user.                                             |
| `CHANNEL_NOT_TEXT`             | Discord error 50008 — the channel doesn't accept messages.                            |
| `MISSING_PERMISSIONS`          | Discord error 50013 — the bot lacks the required permission.                          |
| `INVALID_AUTH_TOKEN`           | Discord error 50014 — the configured bot token is invalid.                            |
| `INVALID_WEBHOOK_TOKEN`        | Discord error 50027 — the configured webhook token is invalid.                        |
| `INVALID_FORM_BODY`            | Discord error 50035 — the request payload failed Discord-side validation.             |
| `MAX_ATTACHMENTS`              | Discord error 30015 — too many attachments on the message.                            |
| `FILE_TOO_LARGE`               | Discord error 50045 — an uploaded file exceeded the size limit.                       |
| `UNAUTHORIZED`                 | HTTP 401 with an undocumented/unparseable error body.                                 |
| `FORBIDDEN`                    | HTTP 403 with an undocumented/unparseable error body.                                 |
| `NOT_FOUND`                    | HTTP 404 with an undocumented/unparseable error body.                                 |
| `RATE_LIMITED`                 | HTTP 429 — see `retryAfter`/`global` metadata to back off correctly.                  |
| `RESPONSE_ERROR`               | A 2xx response whose body failed schema validation.                                   |
| `SERVICE_UNAVAILABLE`          | A 5xx response, or a 4xx body that failed to parse at all.                            |
| `UNKNOWN_ERROR`                | An unknown constructor code was supplied, or an unmapped 4xx status.                  |

Discord's numeric `code` (e.g. `50006`) is reused verbatim in the
message templates above, per this repository's convention of preferring
documented vendor codes over inventing new ones. Codes without a Discord
number are connect-specific (configuration, local validation, or
HTTP-status-only fallbacks).

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof DiscordError && error.code === 'RATE_LIMITED') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, `vendorCode`, `vendorMessage`, `errors` (Discord's nested
per-field validation tree on `50035` responses), or — for `RATE_LIMITED`
— `retryAfter`/`global` from Discord's
[rate limit response](https://discord.com/developers/docs/topics/rate-limits).

---

[← Back to Discord](../README.md)

## Backing off after a 429

`getContextValue('retryAfterSeconds')` — seconds to wait before retrying, read from whichever header the vendor sent: `Retry-After` (delta seconds or an HTTP-date), `X-RateLimit-Reset-After`, or `X-RateLimit-Reset` / `RateLimit-Reset` (a Unix epoch in seconds or milliseconds). `undefined` when none was present — the value is only ever what the vendor said, never a guess. Present on `RATE_LIMITED` when the vendor sent a usable hint.

## Webhook (interaction) codes

| Code                        | Raised when                                             |
| --------------------------- | ------------------------------------------------------- |
| `WEBHOOK_INVALID_HEADERS`   | A signature header is missing.                          |
| `WEBHOOK_TIMESTAMP_INVALID` | Unparseable timestamp, or outside the tolerance window. |
| `WEBHOOK_INVALID_KEY`       | The Public Key is not a 64-hex-char Ed25519 key.        |
| `WEBHOOK_SIGNATURE_INVALID` | **Treat the request as forged.**                        |
