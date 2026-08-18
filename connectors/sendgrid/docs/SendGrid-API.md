# SendGrid API

## Configuration

```ts
import { SendGrid } from '@tundraconnect/sendgrid';

const client = new SendGrid({
  auth: { type: 'BEARER', token: 'SG.xxxxx', prefix: 'Bearer' },
  timeout: 30,
});
```

`auth` is required and must be `{ type: 'BEARER', token, prefix? }` — the
client throws `SendGridError` (`CONFIG_INVALID_API_KEY`) at construction if
it's missing, isn't `type: 'BEARER'`, or its `token` is blank or not a
string. There is no `environment`/sandbox option: SendGrid's "sandbox mode"
is a boolean flag inside the `/mail/send` request body
(`mail_settings.sandbox_mode.enable`), not a different base URL — see
[Quick Start](#quick-start) below.

`auth.token` is sent as `Authorization: <prefix> <token>` on every request,
via RESTler's built-in Bearer auth support (no custom auth handling
needed) — pass `prefix: 'Bearer'` to match SendGrid's documented casing.
`timeout` is expressed in seconds and defaults to `30`.

## Endpoints

| Method        | Endpoint          | Result                                      |
| ------------- | ----------------- | ------------------------------------------- |
| `sendMail()`  | `POST /mail/send` | Sends the message; returns `{ messageId? }` |
| `getScopes()` | `GET /scopes`     | Permission scopes granted to the API key    |

### `sendMail()`

```ts
import { SendGrid } from '@tundraconnect/sendgrid';

const client = new SendGrid({
  auth: { type: 'BEARER', token: 'SG.xxxxx', prefix: 'Bearer' },
});

const { messageId } = await client.sendMail({
  personalizations: [{ to: [{ email: 'dest@example.com' }] }],
  from: { email: 'sender@example.com' },
  subject: 'Hello',
  content: [{ type: 'text/plain', value: 'Hi there!' }],
});

console.log(messageId); // string | undefined — read from X-Message-Id
```

The request is validated against `MailSendRequestSchema` before it's sent —
see [Schemas](SendGrid-Schemas.md). A normal send returns `202 Accepted`; a
send with `mail_settings.sandbox_mode.enable: true` returns `200 OK` instead
once validation passes. `sendMail()` treats both as success. Neither response
carries a body, so `messageId` is read defensively from the `X-Message-Id`
response header — it is not part of SendGrid's formal API contract and may
be absent.

```ts
// Validate a request without delivering it
await client.sendMail({
  personalizations: [{ to: [{ email: 'dest@example.com' }] }],
  from: { email: 'sender@example.com' },
  subject: 'Hello',
  content: [{ type: 'text/plain', value: 'Hi there!' }],
  mail_settings: { sandbox_mode: { enable: true } }, // → 200 OK, not 202
});
```

### `getScopes()`

```ts
const { scopes } = await client.getScopes();
console.log(scopes.includes('mail.send'));
```

A simple way to confirm a configured API key is live and see what it's
permitted to do.

See [Errors](SendGrid-Errors.md) for failure handling and
[Schemas](SendGrid-Schemas.md) for request/response validation.

---

[← Back to SendGrid](../README.md)
