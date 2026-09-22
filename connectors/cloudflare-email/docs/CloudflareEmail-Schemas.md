# CloudflareEmail Schemas

Public Guardian schemas, exported from
`@tundraconnect/cloudflare-email/schemas`.

```ts
import {
  AttachmentSchemaObject,
  SendEmailRequestSchemaObject,
  SendEmailResultSchemaObject,
} from '@tundraconnect/cloudflare-email/schemas';
```

| Export                         | Type                     | Used for                                               |
| ------------------------------ | ------------------------ | ------------------------------------------------------ |
| `SendEmailRequestSchemaObject` | `SendEmailRequestSchema` | The send request body, in wire shape.                  |
| `SendEmailResultSchemaObject`  | `SendEmailResultSchema`  | The unwrapped `result` of a successful send.           |
| `AttachmentSchemaObject`       | `AttachmentSchema`       | One entry of `attachments`.                            |
| `ErrorItemSchemaObject`        | `ErrorItemSchema`        | One entry of an error envelope's `errors` array.       |
| `ErrorEnvelopeSchemaObject`    | `ErrorEnvelopeSchema`    | The failure form of Cloudflare's `client/v4` envelope. |
| `MAX_RECIPIENTS`               | `50`                     | The combined `to` + `cc` + `bcc` ceiling.              |

## `SendEmailRequestSchema`

The **wire** shape: `to`, `cc` and `bcc` are always arrays here. The schema
accepts a bare string for any of them and normalizes it first, so only the
array form reaches Cloudflare.

That normalization is a single top-level `Guardian.preprocess` wrapping the
whole object, never a per-field one. A `Guardian.preprocess` used _as_ a
`Guardian.object()` field's value silently skips its transform, so the raw
string would reach the array check unconverted — see `CONVENTIONS.md` for
the full write-up.

Cross-field rules are **not** enforced here, because an object schema can't
express them. `CloudflareEmail.send` checks both before sending:

- at least one of `html` / `text`
- `to` + `cc` + `bcc` within `MAX_RECIPIENTS`

## `SendEmailResultSchema`

Every field is optional and unknown keys pass through. Email Sending is a
beta API whose `result` shape has already gained a field between the REST
guide and the API reference (`suppressed_recipients`). Pinning a closed
shape would turn any additive vendor change into a `RESPONSE_ERROR` on a
send that actually succeeded — the wrong trade for a call that has already
had a real-world side effect by the time the body is parsed.

## `AttachmentSchema`

`content` is validated as base64 and passed through **verbatim** — it is
never decoded. The most common mistake is supplying a `data:` URI or raw
bytes, which the validator rejects up front instead of letting Cloudflare
fail with an opaque schema error.

| Field         | Type     | Required | Description                                    |
| ------------- | -------- | -------- | ---------------------------------------------- |
| `content`     | `string` | yes      | Base64 payload, no `data:` prefix.             |
| `filename`    | `string` | yes      | Name shown to the recipient.                   |
| `type`        | `string` | yes      | MIME type.                                     |
| `disposition` | `string` | no       | `attachment` (default) or `inline` for `cid:`. |

## A note on coercion

Guardian coerces string-coercible primitives rather than rejecting them, so
a numeric custom header value (`{ 'X-Count': 5 }`) validates and becomes
`'5'` — convenient here, since header values must be strings on the wire. A
value that cannot be coerced, such as a nested object, is rejected.
