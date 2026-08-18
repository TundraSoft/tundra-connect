# PayPal

A typed client for [PayPal's REST API](https://developer.paypal.com/api/rest/)
covering the core Orders v2 payment lifecycle: create an order, check its
status, capture payment once the payer approves it, and refund a capture.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

PayPal's REST API authenticates with OAuth2 client-credentials: an app's
`clientId`/`clientSecret` (from the
[PayPal Developer Dashboard](https://developer.paypal.com/dashboard/)) are
exchanged for a short-lived Bearer access token. This connect handles that
exchange automatically — caching the token until it nears expiry and
transparently re-exchanging it — so every endpoint method just needs
`clientId`/`clientSecret`/`environment` supplied once, at construction.

```ts
import { PayPal } from '@tundraconnect/paypal';

const client = new PayPal({
  auth: {
    type: 'CUSTOM',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    environment: 'sandbox',
  },
});
```

Covers `createOrder`, `getOrder`, `captureOrder`, and `refundCapture`.
Webhook signature verification and PayPal's full `payment_source`
payment-method union (cards, wallets, BNPL, local payment methods, ...) are
out of scope for this v1 — see [docs/PayPal-API.md](docs/PayPal-API.md) for
the exact boundary.

## Documentation

| Topic                             | Description                                |
| --------------------------------- | ------------------------------------------ |
| [API](docs/PayPal-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/PayPal-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/PayPal-Schemas.md) | Public Guardian schemas and inferred types |

## Upstream

- [Vendor API reference](https://developer.paypal.com/api/rest/)
- [Create a vendor account](https://developer.paypal.com/dashboard/)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/paypal
```

**Bun:**

```sh
bunx jsr add @tundraconnect/paypal
```

**Node.js:**

```sh
npx jsr add @tundraconnect/paypal
```

## Quick Start

```ts
import { PayPal } from '@tundraconnect/paypal';

const client = new PayPal({
  auth: {
    type: 'CUSTOM',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    environment: 'sandbox',
  },
});

// Create an order.
const order = await client.createOrder({
  intent: 'CAPTURE',
  purchase_units: [
    { amount: { currency_code: 'USD', value: '10.00' } },
  ],
});
console.log(order.id, order.status); // e.g. '5O19...', 'CREATED'

// Send the payer to the `approve` link returned in `order.links`, then
// (after they approve) look the order up again to confirm it's ready...
const approved = await client.getOrder(order.id);
console.log(approved.status); // 'APPROVED'

// ...and capture payment.
const captured = await client.captureOrder(order.id);
const capture = captured.purchase_units[0]?.payments?.captures?.[0];
console.log(capture?.id, capture?.status); // e.g. '3C67...', 'COMPLETED'

// Refund it later, in full or in part.
await client.refundCapture(capture!.id, {
  amount: { currency_code: 'USD', value: '5.00' },
  note_to_payer: 'Partial refund for damaged item',
});
```

## License

MIT
