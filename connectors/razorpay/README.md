# Razorpay

Typed [Razorpay REST API](https://razorpay.com/docs/api/) client for Deno, Bun,
Node.js and Cloudflare Workers. Create and fetch orders; capture, fetch and list
payments; create payment links; and verify webhook signatures. A lightweight
alternative to the official `razorpay` Node.js SDK for the endpoints it covers.

[![JSR](https://jsr.io/badges/@tundraconnect/razorpay)](https://jsr.io/@tundraconnect/razorpay)
[![JSR Score](https://jsr.io/badges/@tundraconnect/razorpay/score)](https://jsr.io/@tundraconnect/razorpay)

## Overview

Razorpay is an India-focused payments platform. This connect provides
validated `createOrder()`, `getOrder()`, `capturePayment()`, `getPayment()`,
`createPaymentLink()`, and `listPayments()` calls, sending JSON requests and
validating JSON responses against Guardian schemas. It uses RESTler for
transport (HTTP Basic auth, built in) and Guardian for runtime
request/response validation.

**Every `amount` is in the smallest unit of the currency** — paise for
INR, cents for USD, etc. — and is always a positive integer, never a
decimal major-unit amount. ₹299.00 is sent (and returned) as `29900`, not
`299` or `299.00`. This is the most common Razorpay integration mistake;
see [API](https://github.com/TundraSoft/tundra-connect/wiki/Razorpay-API) for details.

## Testing your code

Your tests don't need to fake HTTP. Have your code take a `Razorpay`
instance and pass in a stand-in that returns the shapes from
`@tundraconnect/razorpay/schemas` or throws a real `RazorpayError`:

```ts
import { RazorpayError } from '@tundraconnect/razorpay/errors';

const outage = new RazorpayError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(outage.code);
```

To exercise the client itself against a fake transport, subclass it and
reassign the protected `_fetch`.

## Documentation

| Topic                                                                         | Description                                |
| ----------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/Razorpay-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/Razorpay-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/Razorpay-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [Razorpay API reference](https://razorpay.com/docs/api/)
- [Razorpay API authentication](https://razorpay.com/docs/api/authentication/)
- [Create a Razorpay account](https://dashboard.razorpay.com/signup)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/razorpay
```

**Bun:**

```sh
bunx jsr add @tundraconnect/razorpay
```

**Node.js:**

```sh
npx jsr add @tundraconnect/razorpay
```

## Quick Start

```ts
import { Razorpay } from '@tundraconnect/razorpay';

const client = new Razorpay({
  auth: { type: 'BASIC', username: 'rzp_test_...', password: '...' },
});

// ₹299.00 is sent as 29900 (paise) — see the paise-amount note above.
const order = await client.createOrder({
  amount: 29900,
  currency: 'INR',
  receipt: 'receipt#1',
});
console.log(order.id, order.status);

const payment = await client.capturePayment('pay_...', {
  amount: 29900,
  currency: 'INR',
});
console.log(payment.status, payment.captured);

const link = await client.createPaymentLink({
  amount: 29900,
  description: 'Payment for order #1',
});
console.log(link.short_url);
```

## Webhooks

```ts
import { Razorpay } from '@tundraconnect/razorpay';

const client = new Razorpay({
  auth: { type: 'BASIC', username: 'rzp_test_...', password: '...' },
});

export async function onWebhook(req: Request): Promise<void> {
  const raw = await req.text(); // text(), never json()
  const event = await client.verifyWebhook({
    payload: raw,
    headers: req.headers,
    secret: 'your-webhook-secret',
  });
  const eventId = req.headers.get('x-razorpay-event-id'); // dedupe on this
}
```

See [API → Webhooks](https://github.com/TundraSoft/tundra-connect/wiki/Razorpay-API#webhooks).

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
