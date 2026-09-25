# SendGrid Schemas

The `@tundraconnect/sendgrid/schemas` subpath exports Guardian validators
and inferred types. `sendMail()` validates its request against
`MailSendRequestSchemaObject` before sending it; `getScopes()` validates the
response against `ScopesResponseSchemaObject`.

```ts
import {
  type MailSendRequestSchema,
  MailSendRequestSchemaObject,
} from '@tundraconnect/sendgrid/schemas';

const payload: unknown = {
  personalizations: [{ to: [{ email: 'dest@example.com' }] }],
  from: { email: 'sender@example.com' },
  subject: 'Hello',
  content: [{ type: 'text/plain', value: 'Hi there!' }],
};

const [error, request] = MailSendRequestSchemaObject.safeParse(payload);
if (error || !request) throw error;

const typedRequest: MailSendRequestSchema = request;
console.log(typedRequest.from.email);
```

## Request Schemas

| Schema                         | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `MailSendRequestSchemaObject`  | Full body for `POST /mail/send`                                  |
| `PersonalizationSchemaObject`  | One entry of the `personalizations` array                        |
| `AttachmentSchemaObject`       | One entry of the `attachments` array                             |
| `MailContentSchemaObject`      | One entry of the `content` array (MIME type + body)              |
| `AsmSchemaObject`              | Unsubscribe group association (`asm`)                            |
| `MailSettingsSchemaObject`     | Backend processing toggles (`mail_settings`)                     |
| `TrackingSettingsSchemaObject` | Click/open/subscription/analytics toggles (`tracking_settings`)  |
| `EmailAddressSchemaObject`     | `{ email, name? }`, reused for `from`/`to`/`cc`/`bcc`/`reply_to` |

`MailSendRequestSchemaObject` enforces two cross-field rules Guardian's
per-field validators can't express on their own, via `.refine()`:

- A `subject` is required — either top-level or on **every** personalization
  — unless `template_id` is set.
- `content` is required unless `template_id` is set.

## Response Schemas

| Schema                       | Endpoint                                        |
| ---------------------------- | ----------------------------------------------- |
| `ScopesResponseSchemaObject` | `GET /scopes`                                   |
| `ErrorSchemaObject`          | Vendor error envelopes (4xx/5xx)                |
| `ErrorItemSchemaObject`      | One entry of an error envelope's `errors` array |

## Common Validators

`stringMapGuard` validates the freeform `Record<string, string>` maps
SendGrid accepts in several places (`headers`, `custom_args`,
`substitutions`). `EmailAddressSchemaObject` composes the shared
email-address shape used across `from`, `reply_to`, `reply_to_list`, and
every personalization's `to`/`cc`/`bcc`/`from`.

---

[← Back to SendGrid](../README.md)
