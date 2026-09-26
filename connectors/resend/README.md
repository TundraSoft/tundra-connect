# Resend

Send transactional email through [Resend](https://resend.com)'s REST API
(`https://api.resend.com`): single and batch sends with idempotency keys,
delivery-status lookups, rescheduling and cancelling scheduled email, and
Svix webhook verification — validated locally before anything leaves your
process.

## Overview

| Method                                        | Endpoint                   |
| --------------------------------------------- | -------------------------- |
| `send(email, { idempotencyKey? })`            | `POST /emails`             |
| `sendBatch(emails, { idempotencyKey? })`      | `POST /emails/batch`       |
| `getEmail(id)`                                | `GET /emails/{id}`         |
| `rescheduleEmail(id, scheduledAt)`            | `PATCH /emails/{id}`       |
| `cancelEmail(id)`                             | `POST /emails/{id}/cancel` |
| `verifyWebhook({ payload, headers, secret })` | — (local Svix HMAC check)  |

Authentication is a plain Bearer API key (`re_...`), so no `_authInjector`
override is needed. Resend rejects any request without a `User-Agent` with a
403; the client sends `tundraconnect-resend` unless you configure your own in
`headers`.

```ts
import { Resend } from '@tundraconnect/resend';

const client = new Resend({
  auth: { type: 'BEARER', token: 're_123456789' },
});

const { id } = await client.send({
  from: 'Acme <onboarding@yourdomain.com>',
  to: 'recipient@example.com',
  subject: 'Welcome to Acme!',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
});
console.log('sent', id);
```

## Documentation

| Topic                             | Description                                |
| --------------------------------- | ------------------------------------------ |
| [API](docs/Resend-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/Resend-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/Resend-Schemas.md) | Public Guardian schemas and inferred types |

## Upstream

- [Resend API reference](https://resend.com/docs/api-reference/introduction)
- [Error codes](https://resend.com/docs/api-reference/errors)
- [Verifying webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests)
- [Create a Resend account](https://resend.com/signup)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/resend
```

**Bun:**

```sh
bunx jsr add @tundraconnect/resend
```

**Node.js:**

```sh
npx jsr add @tundraconnect/resend
```

## Quick Start

```ts
import { Resend } from '@tundraconnect/resend';
import { ResendError } from '@tundraconnect/resend/errors';

const client = new Resend({
  auth: { type: 'BEARER', token: Deno.env.get('RESEND_API_KEY')! },
});

try {
  const { id } = await client.send(
    {
      from: 'Acme <billing@yourdomain.com>',
      // A bare string works too, for to / cc / bcc / reply_to.
      to: ['customer@example.com'],
      reply_to: 'support@yourdomain.com',
      subject: 'Your invoice',
      text: 'Your invoice is attached.',
      attachments: [{
        content: btoa('invoice body'), // base64, NOT a data: URI
        filename: 'invoice.txt',
      }],
      tags: [{ name: 'invoice_id', value: 'inv_123' }],
    },
    // Same key + same body within 24h returns the original result instead
    // of sending twice — derive it from your record, not a random value.
    { idempotencyKey: 'invoice-inv_123' },
  );

  const email = await client.getEmail(id);
  console.log(email.last_event); // 'sent', 'delivered', 'bounced', ...
} catch (err) {
  if (err instanceof ResendError) {
    // Branch on the stable code name, never on a message substring.
    if (err.code === 'RATE_LIMITED') {
      // back off and retry with the same idempotency key
    }
    console.error(err.code, err.getContextValue('vendorName'));
  }
  throw err;
}
```

### Batch sends

```ts continued
const { data } = await client.sendBatch([
  {
    from: 'a@yourdomain.com',
    to: 'x@example.com',
    subject: 'Hi X',
    text: 'Hi',
  },
  {
    from: 'a@yourdomain.com',
    to: 'y@example.com',
    subject: 'Hi Y',
    text: 'Hi',
  },
]);
console.log(data.map((ref) => ref.id)); // data[i] is emails[i]
```

A batch holds up to 100 emails and is all-or-nothing. Resend does not
support `attachments` or `scheduled_at` in a batch, so the client rejects
them locally instead of letting them be silently dropped.

### Scheduling

```ts continued
const scheduled = await client.send({
  from: 'a@yourdomain.com',
  to: 'x@example.com',
  subject: 'Reminder',
  text: 'Your trial ends tomorrow.',
  scheduled_at: 'in 1 hour', // or ISO 8601
});
await client.rescheduleEmail(scheduled.id, '2026-12-24T09:00:00Z');
await client.cancelEmail(scheduled.id);
```

### Webhooks

Resend signs webhooks through Svix. Verify with the **raw** body — the
signature breaks on any re-serialization:

```ts continued
Deno.serve(async (req) => {
  const event = await client.verifyWebhook({
    payload: await req.text(), // text(), never json()
    headers: req.headers,
    secret: Deno.env.get('RESEND_WEBHOOK_SECRET')!, // whsec_...
  });
  if (event.type === 'email.bounced') {
    console.log('bounced:', event.data.email_id);
  }
  return new Response(null, { status: 204 });
});
```

### Limits enforced before the request

| Rule                                                                       | Raised as                  |
| -------------------------------------------------------------------------- | -------------------------- |
| One of `html` / `text` / `template`                                        | `REQUEST_VALIDATION_ERROR` |
| `to` has 1–50 valid addresses; `cc` / `bcc` / `reply_to` are valid         | `REQUEST_VALIDATION_ERROR` |
| `from` is `email@domain` or `Name <email@domain>`                          | `REQUEST_VALIDATION_ERROR` |
| Tag names/values: 1–256 ASCII letters, digits, `_`, `-`                    | `REQUEST_VALIDATION_ERROR` |
| Attachment has exactly one of base64 `content` / URL `path`                | `REQUEST_VALIDATION_ERROR` |
| Template variables: string (≤ 2,000 chars) or safe number; `\w{1,50}` keys | `REQUEST_VALIDATION_ERROR` |
| `idempotencyKey` is 1–256 characters                                       | `REQUEST_VALIDATION_ERROR` |
| Batch: 1–100 emails, no `attachments` / `scheduled_at`                     | `REQUEST_VALIDATION_ERROR` |

The 40 MB total message size depends on the whole encoded email, so Resend
enforces it, not this client.

## License

MIT
