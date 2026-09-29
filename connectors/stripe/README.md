# Stripe

Typed [Stripe REST API](https://docs.stripe.com/api) client for Deno, Bun,
Node.js and Cloudflare Workers. Create and retrieve PaymentIntents and create
Customers, with idempotency keys and webhook signature verification. A
lightweight alternative to the official `stripe` SDK for the endpoints it
covers.

[![JSR](https://jsr.io/badges/@tundraconnect/stripe)](https://jsr.io/@tundraconnect/stripe)
[![JSR Score](https://jsr.io/badges/@tundraconnect/stripe/score)](https://jsr.io/@tundraconnect/stripe)

## Overview

Stripe provides validated `createPaymentIntent()`, `retrievePaymentIntent()`,
and `createCustomer()` calls, form-encoding requests the way Stripe's API
requires (`application/x-www-form-urlencoded` with bracket notation for
nested objects/arrays) and validating JSON responses. It uses RESTler for
transport (HTTP Basic auth, built in) and Guardian for runtime
request/response validation.

## Documentation

| Topic                                                                       | Description                                |
| --------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/Stripe-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/Stripe-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/Stripe-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [Stripe API reference](https://docs.stripe.com/api)
- [Stripe API authentication](https://docs.stripe.com/api/authentication)
- [Create a Stripe account](https://dashboard.stripe.com/register)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/stripe
```

**Bun:**

```sh
bunx jsr add @tundraconnect/stripe
```

**Node.js:**

```sh
npx jsr add @tundraconnect/stripe
```

## Quick Start

```ts
import { Stripe } from '@tundraconnect/stripe';

const client = new Stripe({
  auth: { type: 'BASIC', username: 'sk_test_...', password: '' },
});

const intent = await client.createPaymentIntent({
  amount: 1999,
  currency: 'usd',
  automatic_payment_methods: { enabled: true },
});
console.log(intent.id, intent.client_secret);

const customer = await client.createCustomer({
  email: 'jenny@example.com',
  name: 'Jenny Rosen',
});
console.log(customer.id);
```

## Webhooks

```ts
import { Stripe } from '@tundraconnect/stripe';

const client = new Stripe({
  auth: { type: 'BASIC', username: 'sk_test_...', password: '' },
});

export async function onWebhook(req: Request): Promise<void> {
  const raw = await req.text(); // text(), never json()
  const event = await client.verifyWebhook({
    payload: raw,
    headers: req.headers,
    secret: 'whsec_...',
  });
  // `event` is now trustworthy.
}
```

See [API → Webhooks](https://github.com/TundraSoft/tundra-connect/wiki/Stripe-API#webhooks).

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
