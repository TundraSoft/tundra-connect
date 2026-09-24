# Telegram Errors

Telegram throws `TelegramError` for invalid configuration, local request
validation, and vendor responses.

```ts
import {
  TelegramError,
  TelegramErrorCodes,
} from '@tundraconnect/telegram/errors';

const error = new TelegramError('AUTH_FAILED', { status: 401 });
console.log(error.message);
console.log(TelegramErrorCodes.AUTH_FAILED);
```

## Codes

Every Telegram Bot API call — success or failure — returns the same
`{ ok, result, error_code, description, parameters }` envelope. Telegram
documents `error_code` as "subject to change in the future", and in
practice it simply echoes the HTTP status the call returned — so these
codes are connect-specific, keyed off that status, plus a couple of
client-side configuration/local-validation codes that never come from the
wire.

| Code                       | Meaning                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `CONFIG_INVALID_BOT_TOKEN` | The configured bot token is missing, blank, or not a string.                                    |
| `REQUEST_VALIDATION_ERROR` | A request failed local schema validation and was not sent.                                      |
| `BAD_REQUEST`              | Telegram returned `400 Bad Request` (e.g. chat not found, malformed `parse_mode` entities).     |
| `AUTH_FAILED`              | Telegram returned `401 Unauthorized` (invalid or revoked bot token).                            |
| `FORBIDDEN`                | Telegram returned `403 Forbidden` (e.g. the bot was blocked by the user).                       |
| `NOT_FOUND`                | Telegram returned `404 Not Found`.                                                              |
| `RATE_LIMITED`             | Telegram returned `429 Too Many Requests`; `parameters.retry_after` is carried as `retryAfter`. |
| `RESPONSE_ERROR`           | A response body failed envelope or result schema validation.                                    |
| `SERVICE_UNAVAILABLE`      | A `5xx` response, or any response whose body didn't parse.                                      |
| `UNKNOWN_ERROR`            | An unmapped status was returned, or an unknown code was supplied.                               |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof TelegramError && error.code === 'FORBIDDEN') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, the raw `errorCode`/`description` Telegram returned, `retryAfter`
(seconds, on a `429`), and `migrateToChatId` (present when a group chat was
upgraded to a supergroup mid-request — Telegram's own recommended way to
learn the chat's new id):

```ts
try {
  await client.sendMessage({ chat_id: 123456789, text: 'Hi!' });
} catch (error) {
  if (error instanceof TelegramError) {
    console.log(error.getContextValue('status'));
    console.log(error.getContextValue('description'));
    if (error.getContextValue('retryAfter')) {
      console.log(
        'retry after',
        error.getContextValue('retryAfter'),
        'seconds',
      );
    }
  }
}
```

---

[← Back to Telegram](../README.md)

## Backing off after a 429

`getContextValue('retryAfterSeconds')` — seconds to wait before retrying, parsed by RESTler (`_parseRetryAfter`) from `Retry-After` (delta seconds or an HTTP-date), `X-RateLimit-Reset-After`, `RateLimit-Reset`, or an epoch-seconds `X-RateLimit-Reset`; `undefined` when none was present — never a guess. Pass `maxRetryWait` (seconds) at construction to have RESTler wait the hinted time and retry **once**; if that attempt is throttled too, or the hint exceeds the cap, the error is raised with `retried` set so you know whether a wait already happened. Present on `RATE_LIMITED` when the vendor sent a usable hint.
