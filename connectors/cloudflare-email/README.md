# CloudflareEmail

Send transactional email through Cloudflare's Email Sending REST API
(`POST /accounts/{account_id}/email/sending/send`), with local validation
of addresses, attachments and recipient limits before anything leaves your
process.

## Overview

Cloudflare Email Service can send mail two ways: the Workers `send_email`
binding, and this REST endpoint. This connect wraps the **REST endpoint** —
the binding is a Workers-runtime capability that cannot run on Deno, Bun or
Node, whereas the REST API runs everywhere this repo targets.

Authentication is a plain Bearer API token carrying the **Send Email**
permission, so no `_authInjector` override is needed. Cloudflare's standard
`{success, errors, messages, result}` envelope is unwrapped for you: `send`
resolves to the `result` payload, and a failure — including `success: false`
on an HTTP 200 — is raised as a `CloudflareEmailError` carrying the vendor's
own numeric code.

> **Beta:** Email Sending is a Workers Paid beta. An account without the
> entitlement fails every send with `ACCOUNT_NOT_ENTITLED`.

```ts
import { CloudflareEmail } from '@tundraconnect/cloudflare-email';

const client = new CloudflareEmail({
  accountId: 'YOUR_ACCOUNT_ID',
  auth: { type: 'BEARER', token: 'YOUR_API_TOKEN', prefix: 'Bearer' },
});

const result = await client.send({
  from: 'welcome@yourdomain.com',
  to: 'recipient@example.com',
  subject: 'Welcome to our service!',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
  text: 'Welcome! Thanks for signing up.',
});
console.log(result.delivered, result.queued);
```

## Documentation

| Topic                                      | Description                                |
| ------------------------------------------ | ------------------------------------------ |
| [API](docs/CloudflareEmail-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/CloudflareEmail-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/CloudflareEmail-Schemas.md) | Public Guardian schemas and inferred types |

## Upstream

- [Email Sending REST API](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/)
- [Send an email — API reference](https://developers.cloudflare.com/api/resources/email_sending/methods/send/)
- [Cloudflare Email Service docs](https://developers.cloudflare.com/email-service/)
- [Create a Cloudflare account](https://dash.cloudflare.com/sign-up)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/cloudflare-email
```

**Bun:**

```sh
bunx jsr add @tundraconnect/cloudflare-email
```

**Node.js:**

```sh
npx jsr add @tundraconnect/cloudflare-email
```

## Quick Start

```ts
import { CloudflareEmail } from '@tundraconnect/cloudflare-email';
import { CloudflareEmailError } from '@tundraconnect/cloudflare-email/errors';

const client = new CloudflareEmail({
  accountId: Deno.env.get('CF_ACCOUNT_ID')!,
  auth: {
    type: 'BEARER',
    token: Deno.env.get('CF_API_TOKEN')!,
    prefix: 'Bearer',
  },
});

try {
  const result = await client.send({
    from: 'billing@yourdomain.com',
    // A bare string works too — both forms appear in Cloudflare's own docs.
    to: ['customer@example.com'],
    cc: 'accounts@yourdomain.com',
    reply_to: 'support@yourdomain.com',
    subject: 'Your invoice',
    text: 'Your invoice is attached.',
    headers: { 'X-Campaign-ID': 'invoices' },
    attachments: [{
      content: btoa('invoice body'), // base64, NOT a data: URI
      filename: 'invoice.txt',
      type: 'text/plain',
    }],
  });

  console.log('delivered:', result.delivered);
  console.log('queued:', result.queued);
  console.log('bounced:', result.permanent_bounces);
} catch (err) {
  if (err instanceof CloudflareEmailError) {
    // Branch on the stable code name, never on a message substring.
    if (err.code === 'RATE_LIMITED') {
      // back off and retry
    }
    console.error(err.code, err.getContextValue('vendorCode'));
  }
  throw err;
}
```

### Limits enforced before the request

| Rule                                                      | Raised as                  |
| --------------------------------------------------------- | -------------------------- |
| At least one of `html` / `text`                           | `REQUEST_VALIDATION_ERROR` |
| `to` + `cc` + `bcc` &le; 50 recipients                    | `REQUEST_VALIDATION_ERROR` |
| Valid `from` / `to` / `cc` / `bcc` / `reply_to` addresses | `REQUEST_VALIDATION_ERROR` |
| Attachment `content` is base64                            | `REQUEST_VALIDATION_ERROR` |

The 5 MiB total message size is enforced by Cloudflare, not locally — it
depends on the whole encoded message — and surfaces as `MESSAGE_TOO_LARGE`.

## License

MIT
