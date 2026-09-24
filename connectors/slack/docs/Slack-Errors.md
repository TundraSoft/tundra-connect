# Slack Errors

`Slack` throws `SlackError` for invalid configuration, local request
validation, and vendor responses.

```ts
import { SlackError, SlackErrorCodes } from '@tundraconnect/slack/errors';

const error = new SlackError('NOT_FOUND', { vendorError: 'channel_not_found' });
console.log(error.message);
console.log(SlackErrorCodes.NOT_FOUND);
```

## Slack's `{ ok: false, error }` convention

Unlike almost every other connect in this repository, Slack signals most
documented failures with **`HTTP 200 OK`** and
`{ ok: false, error: '<short_error_code>' }` in the response body — not a
4xx/5xx status. `Slack`'s internal response handler therefore reads the
body on _every_ call (success and failure alike), maps the `error` string
to a stable connect-specific code (see the table below), and only falls
back to a genuine HTTP status for real transport-level failures:

1. A real HTTP `429` (with Slack's documented `Retry-After` header) always
   throws `RATE_LIMITED`, regardless of the body.
2. A real HTTP `5xx` always throws `SERVICE_UNAVAILABLE`.
3. Otherwise, `{ ok: false, error }` in the body is mapped via the table
   below.
4. A non-2xx status Slack didn't explain via its own envelope (e.g. an
   intermediating proxy's error page) falls back to `UNKNOWN_ERROR`.

The raw vendor error string always survives on the thrown error's context
as `vendorError`, even when it was mapped to a specific code — see
[Reading diagnostic metadata](#reading-diagnostic-metadata) below.

## Codes

| Code                   | Meaning                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CONFIG_INVALID_TOKEN` | `auth` is missing, isn't `type: 'BEARER'`, or its `token` is blank or not a string.                                                                                                        |
| `INVALID_REQUEST`      | A request failed local schema validation before being sent, or Slack rejected its shape/content (e.g. `invalid_blocks`, `msg_too_long`, `invalid_cursor`, `invalid_limit`, `is_archived`). |
| `RESPONSE_ERROR`       | A response whose `ok` wasn't `false` still failed schema validation.                                                                                                                       |
| `AUTH_FAILED`          | Slack reported `invalid_auth`, `not_authed`, `account_inactive`, `token_revoked`, or `token_expired`.                                                                                      |
| `FORBIDDEN`            | Slack reported `missing_scope`, `no_permission`, `access_denied`, `restricted_action`, `cant_update_message`, `cant_delete_message`, `user_not_visible`, or `ekm_access_denied`.           |
| `NOT_FOUND`            | Slack reported `channel_not_found`, `user_not_found`, or `message_not_found`.                                                                                                              |
| `NOT_IN_CHANNEL`       | Slack reported `not_in_channel` — the bot isn't a member of the target conversation.                                                                                                       |
| `RATE_LIMITED`         | A real HTTP `429` (see the `Retry-After`-derived `retryAfter` context value), or `ok: false` with `error: 'ratelimited'`/`'rate_limited'`.                                                 |
| `SERVICE_UNAVAILABLE`  | A real HTTP `5xx`, or `ok: false` with `error: 'internal_error'`/`'service_unavailable'`/`'fatal_error'`.                                                                                  |
| `UNKNOWN_ERROR`        | An undocumented `error` string, or a non-2xx status Slack didn't explain via its own envelope.                                                                                             |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof SlackError && error.code === 'NOT_IN_CHANNEL') {
  // invite the bot to the channel, then retry
}
```

## Reading diagnostic metadata

Use `getContextValue()` to read diagnostic metadata:

```ts
try {
  await client.postMessage({ channel: 'C123ABC456', text: 'hi' });
} catch (error) {
  if (error instanceof SlackError) {
    console.log(error.getContextValue('vendorError')); // e.g. 'channel_not_found'
    console.log(error.getContextValue('status')); // HTTP status, when relevant
    console.log(error.getContextValue('retryAfter')); // RATE_LIMITED only
  }
}
```

---

[← Back to Slack](../README.md)

## Webhook codes

| Code                        | Raised when                                             |
| --------------------------- | ------------------------------------------------------- |
| `WEBHOOK_INVALID_HEADERS`   | A required signature header is missing.                 |
| `WEBHOOK_TIMESTAMP_INVALID` | Unparseable timestamp, or outside the tolerance window. |
| `WEBHOOK_SIGNATURE_INVALID` | **Treat the request as forged.**                        |

## Backing off after a 429

`getContextValue('retryAfterSeconds')` — seconds to wait before retrying, parsed by RESTler (`_parseRetryAfter`) from `Retry-After` (delta seconds or an HTTP-date), `X-RateLimit-Reset-After`, `RateLimit-Reset`, or an epoch-seconds `X-RateLimit-Reset`; `undefined` when none was present — never a guess. Pass `maxRetryWait` (seconds) at construction to have RESTler wait the hinted time and retry **once**; if that attempt is throttled too, or the hint exceeds the cap, the error is raised with `retried` set so you know whether a wait already happened. Present on `RATE_LIMITED` when the vendor sent a usable hint.
