# SendGrid

Typed [Twilio SendGrid v3 API](https://www.twilio.com/docs/sendgrid) client for
Deno, Bun, Node.js and Cloudflare Workers. Send transactional email, inspect
API-key scopes, and verify ECDSA-signed Event Webhook requests. A lightweight
alternative to `@sendgrid/mail` for the endpoints it covers.

[![JSR](https://jsr.io/badges/@tundraconnect/sendgrid)](https://jsr.io/@tundraconnect/sendgrid)
[![JSR Score](https://jsr.io/badges/@tundraconnect/sendgrid/score)](https://jsr.io/@tundraconnect/sendgrid)

## Overview

SendGrid sends transactional email via `POST /mail/send` and lists the
permission scopes granted to an API key via `GET /scopes`. It uses RESTler
for transport and Guardian for runtime request/response validation — the
mail-send request body (personalizations, attachments, mail settings,
tracking settings, …) is validated before it's ever sent.

## Documentation

| Topic                                                                         | Description                                |
| ----------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/SendGrid-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/SendGrid-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/SendGrid-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [Twilio SendGrid API reference](https://www.twilio.com/docs/sendgrid/api-reference)
- [Create a Twilio SendGrid account](https://signup.sendgrid.com/)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/sendgrid
```

**Bun:**

```sh
bunx jsr add @tundraconnect/sendgrid
```

**Node.js:**

```sh
npx jsr add @tundraconnect/sendgrid
```

## Quick Start

```ts
import { SendGrid } from '@tundraconnect/sendgrid';

const client = new SendGrid({
  auth: { type: 'BEARER', token: 'SG.xxxxx', prefix: 'Bearer' },
});

const { messageId } = await client.sendMail({
  personalizations: [{ to: [{ email: 'dest@example.com' }] }],
  from: { email: 'sender@example.com' },
  subject: 'Hello from SendGrid',
  content: [{ type: 'text/plain', value: 'Hi there!' }],
});

console.log(messageId);
```

## Webhooks

```ts
import { SendGrid } from '@tundraconnect/sendgrid';

const client = new SendGrid({
  auth: { type: 'BEARER', token: 'SG.xxxxx', prefix: 'Bearer' },
});

export async function onEventWebhook(req: Request): Promise<void> {
  const raw = await req.text(); // text(), never json()
  const events = await client.verifyWebhook({
    payload: raw,
    headers: req.headers,
    publicKey: 'your-verification-key',
  });
  // `events` is now trustworthy.
}
```

See [API → Webhooks](https://github.com/TundraSoft/tundra-connect/wiki/SendGrid-API#webhooks).

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
