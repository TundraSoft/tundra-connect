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
codes are connect-specific, keyed off that status, plus client-side
configuration, local-validation and webhook-verification codes that never
come from the Bot API itself.

| Code                            | Meaning                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `CONFIG_INVALID_BOT_TOKEN`      | The configured bot token is missing, blank, or not a string.                                                       |
| `REQUEST_VALIDATION_ERROR`      | A request failed local schema validation and was not sent.                                                         |
| `BAD_REQUEST`                   | Telegram returned `400 Bad Request` (e.g. chat not found, malformed `parse_mode` entities).                        |
| `AUTH_FAILED`                   | Telegram returned `401 Unauthorized` (invalid or revoked bot token).                                               |
| `FORBIDDEN`                     | Telegram returned `403 Forbidden` (e.g. the bot was blocked by the user).                                          |
| `NOT_FOUND`                     | Telegram returned `404 Not Found`.                                                                                 |
| `RATE_LIMITED`                  | Telegram returned `429 Too Many Requests`; `parameters.retry_after` is carried as `retryAfterSeconds`.             |
| `RESPONSE_ERROR`                | A response body failed envelope or result schema validation.                                                       |
| `SERVICE_UNAVAILABLE`           | A `5xx` response, or any response whose body didn't parse.                                                         |
| `TIMEOUT`                       | The Telegram Bot API did not answer within the client `timeout` (`timeoutSeconds` in context).                     |
| `NETWORK_ERROR`                 | `fetch` failed before any response (DNS, TLS, connection reset); the transport error is the `cause`.               |
| `UNKNOWN_ERROR`                 | An unmapped status was returned, or an unknown code was supplied.                                                  |
| `CONFIG_INVALID_WEBHOOK_SECRET` | `verifyWebhookRequest` was given a `secretToken` that is not 1-256 characters of `A-Z a-z 0-9 _ -` (often: unset). |
| `WEBHOOK_SECRET_MISSING`        | The webhook request had no (or an empty) `X-Telegram-Bot-Api-Secret-Token` header.                                 |
| `WEBHOOK_SECRET_INVALID`        | The header did not match the configured secret.                                                                    |
| `WEBHOOK_MALFORMED_BODY`        | The webhook body is not JSON (or not a string).                                                                    |
| `WEBHOOK_INVALID_UPDATE`        | The webhook body is JSON but not an `Update`; `reason` and `responseError` say why.                                |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof TelegramError && error.code === 'FORBIDDEN') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, the raw `errorCode`/`description` Telegram returned,
`retryAfterSeconds` (on a `429`; see below) and `migrateToChatId` (see
[Group migrated to a supergroup](#group-migrated-to-a-supergroup)):

```ts
try {
  await client.sendMessage({ chat_id: 123456789, text: 'Hi!' });
} catch (error) {
  if (error instanceof TelegramError) {
    console.log(error.getContextValue('status'));
    console.log(error.getContextValue('description'));
    if (error.getContextValue('retryAfterSeconds')) {
      console.log(
        'retry after',
        error.getContextValue('retryAfterSeconds'),
        'seconds',
      );
    }
  }
}
```

## Transient failures

`TIMEOUT`, `NETWORK_ERROR`, `SERVICE_UNAVAILABLE` and `RATE_LIMITED` mean
"no answer yet": retrying later can help. Every other code is a definite
refusal or a misconfiguration that retrying will not fix. Branch on the
readonly `err.transient`, which is `true` for exactly these four, rather
than listing codes yourself. The set is also exported as
`TELEGRAM_TRANSIENT_CODES` from `@tundraconnect/telegram/errors`.

```ts
import { TelegramError } from '@tundraconnect/telegram/errors';

declare function callTheClient(): Promise<unknown>;

try {
  await callTheClient();
} catch (err) {
  if (err instanceof TelegramError && err.transient) {
    // queue it and try again later
  }
  throw err;
}
```

| Context          | Present on | Meaning                                   |
| ---------------- | ---------- | ----------------------------------------- |
| `timeoutSeconds` | `TIMEOUT`  | The deadline that was missed, in seconds. |

The bot token is part of the request path, so it is scrubbed (as
`/bot[REDACTED]`) from the `cause` chain of every error before it reaches
you.

## Backing off after a 429

A rate-limited request throws `RATE_LIMITED`. Two context values tell you what to
do next:

| Context             | Meaning                                                                                                                                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retryAfterSeconds` | Seconds Telegram asked you to wait: the body's `parameters.retry_after` when present, otherwise a header hint parsed by RESTler (`Retry-After` as delta seconds or an HTTP-date, `X-RateLimit-Reset-After`, `RateLimit-Reset`, or an epoch-seconds `X-RateLimit-Reset`). `undefined` when neither was sent — never a guess. |
| `retried`           | Set only when `maxRetryWait` is configured: `true` if RESTler already waited once and was throttled again, `false` if it did not wait (the hint exceeded the cap, or there was no hint to wait on).                                                                                                                         |

`RATE_LIMITED` is `transient`. `retryAfter` carries the same body value for
the message text (or `'a few'` when there is none); branch on
`retryAfterSeconds`.

Nothing is retried by default. Opt in with two client options (seconds,
each `0`–`120`):

- **`maxRetryWait`** — when a 429 carries a hint no longer than this,
  RESTler waits that long and retries **once**; otherwise it throws
  `RATE_LIMITED` immediately. `0` disables the retry.
- **`defaultRetryWait`** — the wait used when a 429 carries **no** hint.
  Without it a hintless 429 is never retried: RESTler does not invent a
  delay. Only consulted when `maxRetryWait` is set, and still capped by it.

RESTler's retry reads only response **headers**, while Telegram states its
wait in the body (`parameters.retry_after`). When a 429 carries no header
hint, `maxRetryWait` therefore retries only if `defaultRetryWait` is set,
and the resulting `RATE_LIMITED` has no `retryAfterSeconds`. Whether
Telegram also sends a `Retry-After` header is not documented. Without
`maxRetryWait` the 429 reaches this connect's own mapping, which reads the
body — so for Telegram, leaving `maxRetryWait` unset and waiting
`retryAfterSeconds` yourself (e.g. re-queueing a scheduled summary) keeps
the exact wait Telegram asked for.

## Group migrated to a supergroup

When a group is upgraded to a supergroup, its chat id changes. A request to
the old id fails with `BAD_REQUEST` whose `migrateToChatId` context value
(Telegram's `parameters.migrate_to_chat_id`) is the new id; store it and
send there from now on. The same id also arrives in the group as a service
message (`update.message.migrate_to_chat_id`, with the supergroup's message
carrying `migrate_from_chat_id`), so a webhook bot can update its stored
chat ids before a send ever fails.

```ts
try {
  await client.sendMessage({ chat_id: -123456789, text: 'Daily summary' });
} catch (error) {
  const newId = error instanceof TelegramError
    ? error.getContextValue('migrateToChatId')
    : undefined;
  if (typeof newId === 'number') {
    await client.sendMessage({ chat_id: newId, text: 'Daily summary' });
  } else {
    throw error;
  }
}
```

## Webhook verification

`Telegram.verifyWebhookRequest` throws the five `WEBHOOK_*` /
`CONFIG_INVALID_WEBHOOK_SECRET` codes above. None is transient, and none
carries the configured secret or the received header value in its message
or context. Map them to responses like this:

| Code                            | Respond | Why                                                             |
| ------------------------------- | ------- | --------------------------------------------------------------- |
| `WEBHOOK_SECRET_MISSING`        | `401`   | Not from Telegram (or the webhook was set without this secret). |
| `WEBHOOK_SECRET_INVALID`        | `401`   | Not from Telegram, or the secret was rotated on one side only.  |
| `WEBHOOK_MALFORMED_BODY`        | `200`   | Telegram redelivers on non-2xx; this body will never parse.     |
| `WEBHOOK_INVALID_UPDATE`        | `200`   | Same; log `reason` to see which field failed.                   |
| `CONFIG_INVALID_WEBHOOK_SECRET` | `500`   | The deployment's secret is unset or invalid.                    |

---

[← Back to Telegram](../README.md)
