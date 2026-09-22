# DodoPayments

Accept payments and manage subscriptions through
[Dodo Payments](https://dodopayments.com), a merchant-of-record platform for
digital products. Covers the checkout path end to end: initialize a payment,
verify it actually completed, read a customer's history, and create or cancel
subscriptions — plus Standard Webhooks signature verification.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers & Browser](https://img.shields.io/badge/Cloudflare_Workers_%26_Browser-compatible-orange?logo=cloudflareworkers)

## Overview

Dodo is a **merchant of record**: it handles tax and compliance on your
behalf, which is why `billing.country` is required on every create call.

This connect deliberately wraps the payment and subscription surface a
checkout flow actually needs, not the vendor's full ~147-endpoint API.

| Area          | Methods                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| Payments      | `createPayment`, `getPayment`, `isPaid`, `listPayments`, `listAllPayments`                                 |
| Subscriptions | `createSubscription`, `getSubscription`, `listSubscriptions`, `listAllSubscriptions`, `cancelSubscription` |
| Customers     | `getCustomer`                                                                                              |
| Webhooks      | `verifyWebhookSignature`                                                                                   |

Two things this connect is opinionated about, both because getting them
wrong costs real money:

- **It defaults to test mode.** `mode` is `'test'` unless you say
  otherwise, so reaching production is an explicit act rather than an
  oversight.
- **`isPaid` is true only for `succeeded`.** `processing` and the whole
  `requires_*` family mean the money has _not_ settled.

> **Amounts are in the currency's smallest unit** — cents for USD, yen for
> JPY. `1999` is $19.99, never $1999.

```ts
import { DodoPayments } from '@tundraconnect/dodo-payments';

// Defaults to TEST mode — pass mode: 'live' for real money.
const client = new DodoPayments({
  auth: { type: 'BEARER', token: 'YOUR_API_KEY', prefix: 'Bearer' },
});

const created = await client.createPayment({
  product_cart: [{ product_id: 'prd_1', quantity: 1 }],
  customer: { email: 'buyer@example.com', name: 'Ada' },
  billing: { country: 'US' },
  payment_link: true,
});
console.log(created.payment_link); // send the buyer here
```

## Documentation

| Topic                                   | Description                                         |
| --------------------------------------- | --------------------------------------------------- |
| [Flows](docs/DodoPayments-Flows.md)     | End-to-end payment, subscription and customer flows |
| [API](docs/DodoPayments-API.md)         | Client configuration and endpoint methods           |
| [Errors](docs/DodoPayments-Errors.md)   | Error codes and diagnostic metadata                 |
| [Schemas](docs/DodoPayments-Schemas.md) | Public Guardian schemas and inferred types          |

## Upstream

- [API reference](https://docs.dodopayments.com/api-reference/introduction)
- [Payments integration guide](https://docs.dodopayments.com/api-reference/integration-guide)
- [Subscription integration guide](https://docs.dodopayments.com/developer-resources/subscription-integration-guide)
- [Webhooks](https://docs.dodopayments.com/developer-resources/webhooks)
- [Create a Dodo Payments account](https://app.dodopayments.com/signup)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/dodo-payments
```

**Bun:**

```sh
bunx jsr add @tundraconnect/dodo-payments
```

**Node.js:**

```sh
npx jsr add @tundraconnect/dodo-payments
```

## Quick Start

### 1. Initialize a payment

```ts
const created = await client.createPayment({
  product_cart: [{ product_id: 'prd_1', quantity: 2 }],
  customer: { email: 'buyer@example.com', name: 'Ada' },
  billing: { country: 'DE' },
  payment_link: true,
  return_url: 'https://example.com/thanks',
});

redirect(created.payment_link!);
```

`created.client_secret` is a credential for confirming the payment from a
client SDK — never log it or expose it outside the buyer's own session.

### 2. Verify it actually completed

**Never trust the browser redirect.** The buyer controls it, and a
`?status=success` query parameter proves nothing. Confirm server-side:

```ts
if (await client.isPaid(paymentId)) {
  await fulfilOrder(paymentId);
}
```

Or inspect the full record when you need the detail:

```ts
const payment = await client.getPayment(paymentId);
payment.status; // 'succeeded' | 'processing' | 'requires_*' | ...
payment.total_amount; // 1999 === $19.99
payment.error_message; // set when status is 'failed'
```

### 3. Subscriptions

```ts
const sub = await client.createSubscription({
  product_id: 'prd_monthly',
  quantity: 1,
  customer: { customer_id: 'cus_1' },
  billing: { country: 'US' },
  payment_link: true,
  trial_period_days: 14,
});

// A created subscription is NOT yet active.
if (sub.payment_method_required) redirect(sub.payment_link!);

// Cancel immediately …
await client.cancelSubscription('sub_1');

// … or at the end of the paid period.
const ended = await client.cancelSubscription('sub_1', {
  atPeriodEnd: true,
  comment: 'Downgrading to free',
});
ended.status; // still 'active' — see below
ended.cancel_at_next_billing_date; // true
```

> A period-end cancellation leaves `status` as `'active'` until the date
> arrives. Read `cancel_at_next_billing_date`, not `status`, or you will
> conclude the cancellation did not take.

### 4. Show a customer what they have

Both list methods take `customerId`, and status comes back inline — no
follow-up fetch per record.

```ts
const [customer, payments, subscriptions] = await Promise.all([
  client.getCustomer(customerId),
  client.listPayments({ customerId, pageSize: 20 }),
  client.listSubscriptions({ customerId }),
]);

const active = subscriptions.filter((s) => s.status === 'active');
const paid = payments.filter((p) => p.status === 'succeeded');
```

Filter server-side instead of paging and discarding:

```ts
await client.listPayments({ customerId, status: 'succeeded' });
await client.listSubscriptions({ customerId, status: 'active' });
```

Walk a full history with the auto-paging iterators:

```ts
for await (const p of client.listAllPayments({ customerId })) {
  console.log(p.payment_id, p.status);
}
```

Charge history for a single subscription:

```ts
const renewals = await client.listPayments({ subscriptionId: 'sub_1' });
```

Two things to know:

- A payment's `status` is optional and nullable; a subscription's is
  always present. Absent is _unknown_ — never infer success from "not
  failed".
- `listSubscriptions` returns the full subscription object, but
  `listPayments` returns a lighter record without `refunds`, `disputes`,
  `product_cart`, `billing` or `error_message`. Call `getPayment` for the
  rows that need those.

### 5. Verify webhooks

```ts
import { verifyWebhookSignature } from '@tundraconnect/dodo-payments';

// Note req.text() — NOT req.json().
const raw = await req.text();
const event = await verifyWebhookSignature({
  payload: raw,
  headers: req.headers,
  secret: Deno.env.get('DODO_WEBHOOK_SECRET')!,
});
// `event` is now trustworthy.
```

Verification is constant-time, enforces a 5-minute replay window in both
directions, and is deliberately sensitive to the raw bytes: re-serializing
parsed JSON changes whitespace and key order and will fail. That strictness
is the point — it guarantees you act on exactly the body that was signed.

## License

MIT
