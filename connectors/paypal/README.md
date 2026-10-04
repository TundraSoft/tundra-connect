# PayPal

Typed [PayPal REST API](https://developer.paypal.com/api/rest/) client for Deno,
Bun, Node.js and Cloudflare Workers, covering the Orders v2 payment lifecycle:
create an order, check its status, capture payment once the payer approves it,
and refund a capture. OAuth2 access tokens are fetched and refreshed
automatically, requests carry idempotency keys, and webhook signatures can be
verified.

[![JSR](https://jsr.io/badges/@tundraconnect/paypal)](https://jsr.io/@tundraconnect/paypal)
[![JSR Score](https://jsr.io/badges/@tundraconnect/paypal/score)](https://jsr.io/@tundraconnect/paypal)

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
out of scope for this v1 — see [docs/PayPal-API.md](https://github.com/TundraSoft/tundra-connect/wiki/PayPal-API) for
the exact boundary.

## Testing your code

Your tests don't need to fake HTTP. Have your code take a `PayPal` instance
and pass in a stand-in that returns the shapes from
`@tundraconnect/paypal/schemas` or throws a real `PayPalError`:

```ts
import { PayPalError } from '@tundraconnect/paypal/errors';

const outage = new PayPalError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(outage.code);
```

To exercise the client itself against a fake transport, subclass it and
reassign the protected `_fetch`.

## Documentation

| Topic                                                                       | Description                                |
| --------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/PayPal-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/PayPal-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/PayPal-Schemas) | Public Guardian schemas and inferred types |

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

## Webhooks

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

export async function onWebhook(req: Request): Promise<void> {
  const raw = await req.text(); // text(), never json()
  const event = await client.verifyWebhook({
    payload: raw,
    headers: req.headers,
    webhookId: 'your-webhook-id',
  });
  // `event` is now trustworthy.
}
```

See [API → Webhooks](https://github.com/TundraSoft/tundra-connect/wiki/PayPal-API#webhooks).

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
