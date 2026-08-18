# SendGrid

Typed, cross-runtime client for the [Twilio SendGrid v3 API](https://www.twilio.com/docs/sendgrid).

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers & Browser](https://img.shields.io/badge/Cloudflare_Workers_%26_Browser-compatible-orange?logo=cloudflareworkers)

## Overview

SendGrid sends transactional email via `POST /mail/send` and lists the
permission scopes granted to an API key via `GET /scopes`. It uses RESTler
for transport and Guardian for runtime request/response validation — the
mail-send request body (personalizations, attachments, mail settings,
tracking settings, …) is validated before it's ever sent.

## Documentation

| Topic                               | Description                                |
| ----------------------------------- | ------------------------------------------ |
| [API](docs/SendGrid-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/SendGrid-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/SendGrid-Schemas.md) | Public Guardian schemas and inferred types |

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

## License

MIT
