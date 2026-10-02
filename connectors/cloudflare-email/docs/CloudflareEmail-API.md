# CloudflareEmail API

Client configuration and endpoint methods for
`@tundraconnect/cloudflare-email`.

## Configuration

```ts
import { CloudflareEmail } from '@tundraconnect/cloudflare-email';

const client = new CloudflareEmail({
  accountId: 'YOUR_ACCOUNT_ID',
  auth: { type: 'BEARER', token: 'YOUR_API_TOKEN', prefix: 'Bearer' },
});
```

| Option      | Type                  | Required | Default                                | Description                                                     |
| ----------- | --------------------- | -------- | -------------------------------------- | --------------------------------------------------------------- |
| `accountId` | `string`              | yes      | —                                      | Account that owns the verified sending domain. Trimmed on set.  |
| `auth`      | `CloudflareEmailAuth` | yes      | —                                      | `{ type: 'BEARER', token, prefix? }` with the Send Email scope. |
| `baseURL`   | `string`              | no       | `https://api.cloudflare.com/client/v4` | Override for a proxy or a test double.                          |
| `timeout`   | `number`              | no       | `30`                                   | Request timeout in seconds.                                     |

Both required options are validated at construction:

- `auth` missing, not `BEARER`, or a blank token &rarr;
  `CONFIG_INVALID_API_TOKEN`
- `accountId` missing or blank &rarr; `CONFIG_INVALID_ACCOUNT_ID`

`auth` is a Bearer token, so RESTler's base `_authInjector` emits the
`Authorization` header and this connect overrides nothing.

### Getters

| Getter      | Type     | Description                 |
| ----------- | -------- | --------------------------- |
| `vendor`    | `string` | Always `'CloudflareEmail'`. |
| `accountId` | `string` | The configured account id.  |

## Endpoints

### `send(options)`

`POST /accounts/{account_id}/email/sending/send`

Sends one email and resolves to the **unwrapped** `result` payload —
Cloudflare's `{success, errors, messages, result}` envelope is stripped by
the connect's response handler.

```ts
const result = await client.send({
  from: 'welcome@yourdomain.com',
  to: 'recipient@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome!</h1>',
  text: 'Welcome!',
});
```

#### Parameters

| Field         | Type                             | Required | Description                                                       |
| ------------- | -------------------------------- | -------- | ----------------------------------------------------------------- |
| `from`        | `EmailAddress`                   | yes      | Sender, on a domain verified in the account.                      |
| `to`          | `EmailAddress \| EmailAddress[]` | yes      | Recipient(s). A single address is normalized to a one-item array. |
| `subject`     | `string`                         | yes      | Subject line. Must be non-empty.                                  |
| `html`        | `string`                         | no\*     | HTML body.                                                        |
| `text`        | `string`                         | no\*     | Plain-text body.                                                  |
| `cc`          | `EmailAddress \| EmailAddress[]` | no       | Carbon-copy recipient(s).                                         |
| `bcc`         | `EmailAddress \| EmailAddress[]` | no       | Blind-carbon-copy recipient(s).                                   |
| `reply_to`    | `EmailAddress`                   | no       | Reply address, when different from `from`.                        |
| `headers`     | `Record<string, string>`         | no       | Custom headers. Numeric values are coerced to strings.            |
| `attachments` | `AttachmentSchema[]`             | no       | Base64-encoded files.                                             |

\* At least one of `html` / `text` is required.

`EmailAddress` is any of:

| Form           | Example                                             | Sent as               |
| -------------- | --------------------------------------------------- | --------------------- |
| Plain address  | `'jane@example.com'`                                | the string, unchanged |
| Named object   | `{ address: 'jane@example.com', name: 'Jane Doe' }` | the object, unchanged |
| Display string | `'Jane Doe <jane@example.com>'`                     | `{ address, name }`   |

Arrays may mix forms. The named object's key is `address`, as the REST API
documents — **not** `email`, which is the Workers `send_email` binding's
key and is rejected here. A display string's name may be double-quoted
(`'"Doe, Jane" <jane@example.com>'`); the quotes are stripped.

```ts
await client.send({
  from: 'Acme <no-reply@yourdomain.com>',
  to: ['plain@example.com', { address: 'jane@example.com', name: 'Jane Doe' }],
  subject: 'Hello',
  text: 'Hi there!',
});
// wire: "from": { "address": "no-reply@yourdomain.com", "name": "Acme" }
```

> Field names are Cloudflare's own — `reply_to`, not `replyTo` — so a body
> copied from the vendor's docs works unchanged.

#### Why `to` accepts a single address or an array

Cloudflare's own documentation disagrees with itself: the Email Sending
quickstart's `curl` passes `"to": "recipient@example.com"` as a plain
string, while the API reference specifies an array. This connect
accepts either and always **sends** the array form, so a caller who copied
either version of the vendor's docs gets the same wire-correct result.

#### Returns

`SendEmailResultSchema` — see
[Schemas](CloudflareEmail-Schemas.md).

| Field                   | Type       | Description                               |
| ----------------------- | ---------- | ----------------------------------------- |
| `delivered`             | `string[]` | Handed to the destination MTA.            |
| `queued`                | `string[]` | Accepted, delivery pending.               |
| `permanent_bounces`     | `string[]` | Hard bounce — do not retry.               |
| `suppressed_recipients` | `string[]` | Skipped via the account suppression list. |
| `message_id`            | `string`   | Per-message id, when returned.            |

Every field is optional and unknown fields pass through — see
[Schemas](CloudflareEmail-Schemas.md) for why.

#### Throws

`CloudflareEmailError` only. See
[Errors](CloudflareEmail-Errors.md) for the full code list and the
vendor-code mapping.

---

[← Back to CloudflareEmail](../README.md)
