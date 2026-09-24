# Razorpay

Typed, cross-runtime client for the [Razorpay REST API](https://razorpay.com/docs/api/), covering Order create/fetch, Payment capture/fetch/list, and Payment Link creation.

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
see [API](docs/Razorpay-API.md) for details.

## Documentation

| Topic                               | Description                                |
| ----------------------------------- | ------------------------------------------ |
| [API](docs/Razorpay-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/Razorpay-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/Razorpay-Schemas.md) | Public Guardian schemas and inferred types |

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
const raw = await req.text(); // text(), never json()
const event = await client.verifyWebhook({
  payload: raw,
  headers: req.headers,
  secret: RAZORPAY_WEBHOOK_SECRET,
});
const eventId = req.headers.get('x-razorpay-event-id'); // dedupe on this
```

See [API → Webhooks](docs/Razorpay-API.md#webhooks).

## License

MIT
