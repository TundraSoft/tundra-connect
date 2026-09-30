# Resend Schemas

Public Guardian schemas, exported from `@tundraconnect/resend/schemas`.

```ts
import {
  EmailSchemaObject,
  SendEmailRequestSchemaObject,
  WebhookEventSchemaObject,
} from '@tundraconnect/resend/schemas';
```

| Export                          | Type                      | Used for                                               |
| ------------------------------- | ------------------------- | ------------------------------------------------------ |
| `SendEmailRequestSchemaObject`  | `SendEmailRequestSchema`  | One email's request body, in wire shape.               |
| `TemplateSchemaObject`          | `TemplateSchema`          | A request's `template` — id and variables.             |
| `AttachmentSchemaObject`        | `AttachmentSchema`        | One entry of `attachments`.                            |
| `TagSchemaObject`               | `TagSchema`               | One `{ name, value }` tag.                             |
| `EmailRefSchemaObject`          | `EmailRefSchema`          | `{ id, object? }` from send / reschedule / cancel.     |
| `SendBatchResponseSchemaObject` | `SendBatchResponseSchema` | `{ data: EmailRefSchema[] }` from a batch send.        |
| `EmailSchemaObject`             | `EmailSchema`             | A retrieved email with its `last_event`.               |
| `WebhookEventSchemaObject`      | `WebhookEventSchema`      | A verified webhook event `{ type, created_at, data }`. |
| `ErrorResponseSchemaObject`     | `ErrorResponseSchema`     | Resend's `{ statusCode, name, message }` error body.   |
| `MAX_RECIPIENTS`                | `50`                      | The `to` ceiling.                                      |
| `SENDER_PATTERN`                | `RegExp`                  | Accepted `from` shapes.                                |
| `TAG_PATTERN`                   | `RegExp`                  | Accepted tag name/value characters.                    |

## `SendEmailRequestSchema`

The **wire** shape: `to`, `cc`, `bcc` and `reply_to` are always arrays. The
schema accepts a bare string for any of them and normalizes it first — as a
single top-level `Guardian.preprocess`, since a per-field preprocess is
silently skipped inside `Guardian.object()`.

`from` is checked against `SENDER_PATTERN` rather than `.email()` so the
display-name form `Acme <a@yourdomain.com>` — the one most senders use — is
accepted.

The cross-field rule "one of `html` / `text` / `template`" is not expressible
in an object schema; `Resend.send` and `Resend.sendBatch` enforce it.

## `TemplateSchema`

Variable values must be strings of at most 2,000 characters or finite numbers
within ±2^53−1, and names 1–50 ASCII letters, digits or underscores.
Values are checked with an explicit `typeof`, because Guardian's string guard
coerces — a boolean would otherwise go out as `"true"` instead of failing.

## `AttachmentSchema`

Exactly one of `content` (base64, not a `data:` URI) or `path` (a URL Resend
fetches) is required — Resend's `invalid_attachment` rule, checked locally.

## `EmailSchema`

Mirrors `GET /emails/{id}`. Fields Resend documents as `null` when unset
(`html`, `text`, `cc`, `bcc`, `reply_to`, `scheduled_at`, `message_id`,
`tags`) are `nullable`. `last_event` is an open string and unknown keys pass
through, so additive vendor changes never break retrieval.

## `WebhookEventSchema`

`data` is an open record: its shape depends on `type` (`email.*` events carry
`email_id`, `to`, `subject`, ...; `domain.*` and `contact.*` events carry
their resource), and Resend adds event types over time.
