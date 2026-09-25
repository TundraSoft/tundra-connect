# Stripe

Typed, cross-runtime client for the [Stripe REST API](https://docs.stripe.com/api), covering PaymentIntent create/retrieve and Customer create.

## Overview

Stripe provides validated `createPaymentIntent()`, `retrievePaymentIntent()`,
and `createCustomer()` calls, form-encoding requests the way Stripe's API
requires (`application/x-www-form-urlencoded` with bracket notation for
nested objects/arrays) and validating JSON responses. It uses RESTler for
transport (HTTP Basic auth, built in) and Guardian for runtime
request/response validation.

## Documentation

| Topic                             | Description                                |
| --------------------------------- | ------------------------------------------ |
| [API](docs/Stripe-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/Stripe-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/Stripe-Schemas.md) | Public Guardian schemas and inferred types |

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
const raw = await req.text(); // text(), never json()
const event = await client.verifyWebhook({
  payload: raw,
  headers: req.headers,
  secret: STRIPE_WEBHOOK_SECRET,
});
```

See [API → Webhooks](docs/Stripe-API.md#webhooks).

## License

MIT
