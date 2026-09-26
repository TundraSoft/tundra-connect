# Resend API

Client configuration and endpoint methods for `@tundraconnect/resend`.

## Configuration

```ts
import { Resend } from '@tundraconnect/resend';

const client = new Resend({
  auth: { type: 'BEARER', token: 're_123456789' },
});
```

| Option         | Type                     | Required | Default                  | Description                                                                  |
| -------------- | ------------------------ | -------- | ------------------------ | ---------------------------------------------------------------------------- |
| `auth`         | `ResendAuth`             | yes      | —                        | `{ type: 'BEARER', token, prefix? }`. `prefix` defaults to `Bearer`.         |
| `headers`      | `Record<string, string>` | no       | `{ 'User-Agent': … }`    | Extra headers on every request. A `User-Agent` here replaces the default.    |
| `baseURL`      | `string`                 | no       | `https://api.resend.com` | Override for a proxy or a test double.                                       |
| `timeout`      | `number`                 | no       | `30`                     | Request timeout in seconds.                                                  |
| `maxRetryWait` | `number`                 | no       | —                        | Opt in to one RESTler retry on a 429 whose hint is within this many seconds. |

`auth` missing, not `BEARER`, or a blank token &rarr; `CONFIG_INVALID_API_KEY`
at construction.

Resend has two kinds of API key. A **sending access** key can only call
`send` and `sendBatch`; `getEmail`, `rescheduleEmail` and `cancelEmail` need
**full access** and otherwise fail with `AUTH_FAILED`
(`vendorName: 'restricted_api_key'`).

Resend rejects a request with no `User-Agent` (HTTP 403). Server runtimes'
`fetch` doesn't reliably add one, so the client always sends
`tundraconnect-resend` (`DEFAULT_USER_AGENT`) unless you set your own.

The API key is never readable back off the client — there is no getter for
it.

## Endpoints

### `send(email, options?)`

`POST /emails` &rarr; `EmailRefSchema` (`{ id }`)

```ts continued
const { id } = await client.send(
  {
    from: 'Acme <onboarding@yourdomain.com>',
    to: 'recipient@example.com',
    subject: 'Hello',
    html: '<p>Hi</p>',
  },
  { idempotencyKey: 'welcome-user_123' },
);
```

| Field          | Type                     | Required | Description                                                         |
| -------------- | ------------------------ | -------- | ------------------------------------------------------------------- |
| `from`         | `string`                 | yes      | `email@domain` or `Name <email@domain>`, on a verified domain.      |
| `to`           | `string \| string[]`     | yes      | 1–50 recipients. A bare string becomes a one-item array.            |
| `subject`      | `string`                 | yes      | Non-empty.                                                          |
| `html`         | `string`                 | no\*     | HTML body.                                                          |
| `text`         | `string`                 | no\*     | Plain-text body. Resend derives one from `html` when omitted.       |
| `template`     | `TemplateSchema`         | no\*     | `{ id, variables? }` — a published template.                        |
| `cc`           | `string \| string[]`     | no       | Carbon-copy recipient(s).                                           |
| `bcc`          | `string \| string[]`     | no       | Blind-carbon-copy recipient(s).                                     |
| `reply_to`     | `string \| string[]`     | no       | Reply-to address(es).                                               |
| `headers`      | `Record<string, string>` | no       | Custom email headers.                                               |
| `attachments`  | `AttachmentSchema[]`     | no       | Base64 `content` or a URL `path`.                                   |
| `tags`         | `TagSchema[]`            | no       | `{ name, value }` pairs, echoed back by `getEmail` and in webhooks. |
| `scheduled_at` | `string`                 | no       | ISO 8601 or natural language (`in 1 hour`).                         |
| `topic_id`     | `string`                 | no       | Topic governing contact subscription preferences.                   |

\* One of `html` / `text` / `template` is required.

`options.idempotencyKey` (1–256 characters) is sent as `Idempotency-Key`.
Resend remembers it for 24 hours: a retry with the same key and body returns
the original result; the same key with a different body, or while the first
request is still in flight, fails with `IDEMPOTENCY_CONFLICT`.

### `sendBatch(emails, options?)`

`POST /emails/batch` &rarr; `SendBatchResponseSchema` (`{ data: [{ id }] }`)

1–100 emails, each validated exactly like `send`. `data[i]` is the id of
`emails[i]`. The batch is all-or-nothing. `attachments` and `scheduled_at`
are rejected locally (Resend does not support them in a batch). A local
validation failure carries the offending email's `index` in its context.

### `getEmail(id)`

`GET /emails/{id}` &rarr; `EmailSchema`

```ts continued
const email = await client.getEmail(id);
console.log(email.last_event, email.tags);
```

`last_event` is Resend's latest delivery event for the email (`sent`,
`delivered`, `delivery_delayed`, `bounced`, `complained`, `opened`,
`clicked`, `scheduled`, `canceled`, `failed`, `suppressed`, ...). It is typed
as an open `string` so a new event type never breaks retrieval.

### `rescheduleEmail(id, scheduledAt)`

`PATCH /emails/{id}` with `{ scheduled_at }` &rarr; `EmailRefSchema`

Moves a scheduled, not-yet-sent email.

### `cancelEmail(id)`

`POST /emails/{id}/cancel` &rarr; `EmailRefSchema`

Cancels a scheduled, not-yet-sent email.

Every id argument is percent-encoded into the path, and a blank id is
rejected locally as `REQUEST_VALIDATION_ERROR`.

### `verifyWebhook(options)`

Local check — no request, no API key used.

```ts continued
declare const req: Request;
const event = await client.verifyWebhook({
  payload: await req.text(),
  headers: req.headers,
  secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
});
```

| Field              | Type                 | Required | Description                                               |
| ------------------ | -------------------- | -------- | --------------------------------------------------------- |
| `payload`          | `string`             | yes      | The raw request body.                                     |
| `headers`          | `WebhookHeadersLike` | yes      | A `Headers` instance or a plain object; case-insensitive. |
| `secret`           | `string`             | yes      | The endpoint's signing secret, with or without `whsec_`.  |
| `toleranceSeconds` | `number`             | no       | Replay window, default `300`, applied in both directions. |
| `nowMs`            | `number`             | no       | Clock override, for tests.                                |

Resend delivers webhooks through Svix: HMAC-SHA256 over
`<svix-id>.<svix-timestamp>.<rawBody>`, keyed by the base64-decoded secret,
carried in `svix-signature` as space-separated `v1,<base64>` entries (more
than one during secret rotation — any match is accepted, each compared in
constant time). The Standard Webhooks aliases `webhook-id` /
`webhook-timestamp` / `webhook-signature` are accepted too.

Resolves to the parsed, validated `WebhookEventSchema`
(`{ type, created_at, data }`).
