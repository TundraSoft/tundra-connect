# Dodo Payments

Typed [Dodo Payments](https://dodopayments.com) API client for Deno, Bun,
Node.js and Cloudflare Workers. Dodo Payments is a merchant-of-record platform
for digital products, and this client covers its checkout path end to end:
initialize a payment, verify it actually completed, read a customer's history,
create, change, pause or cancel subscriptions, refund a payment in full or in
part, manage the product catalogue and discount codes, open the customer
portal, and verify Standard Webhooks signatures.

[![JSR](https://jsr.io/badges/@tundraconnect/dodo-payments)](https://jsr.io/@tundraconnect/dodo-payments)
[![JSR Score](https://jsr.io/badges/@tundraconnect/dodo-payments/score)](https://jsr.io/@tundraconnect/dodo-payments)

## Overview

Dodo is a **merchant of record**: it handles tax and compliance on your
behalf, which is why `billing.country` is required on every create call.

This connect deliberately wraps the surface a checkout flow and its
catalogue actually need, not the vendor's full ~147-endpoint API.

| Area          | Methods                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Payments      | `createPayment`, `getPayment`, `isPaid`, `listPayments`, `listAllPayments`                                                                                                                                                           |
| Refunds       | `createRefund`, `getRefund`, `listRefunds`, `listAllRefunds`                                                                                                                                                                         |
| Subscriptions | `createSubscription`, `getSubscription`, `listSubscriptions`, `listAllSubscriptions`, `changePlan`, `cancelScheduledPlanChange`, `pauseSubscription`, `resumeSubscription`, `cancelSubscription`, `undoScheduledCancellation`        |
| Products      | `createProduct`, `getProduct`, `listProducts`, `listAllProducts`, `findProductsByMetadata`, `updateProduct`, `archiveProduct`, `unarchiveProduct`                                                                                    |
| Discounts     | `createDiscount`, `getDiscount`, `getDiscountByCode`, `listDiscounts`, `listAllDiscounts`, `updateDiscount`, `deleteDiscount`, `addDiscountCustomers`, `listDiscountCustomers`, `listAllDiscountCustomers`, `removeDiscountCustomer` |
| Customers     | `getCustomer`, `createCustomerPortalSession`                                                                                                                                                                                         |
| Webhooks      | `verifyWebhook`                                                                                                                                                                                                                      |

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

## Testing your code

Your tests don't need to fake HTTP. Have your code take a `DodoPayments` instance
and pass in a stand-in that returns the shapes from
`@tundraconnect/dodo-payments/schemas` or throws a real `DodoPaymentsError`:

```ts
import { DodoPaymentsError } from '@tundraconnect/dodo-payments/errors';

const outage = new DodoPaymentsError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(outage.code);
```

To exercise the client itself against a fake transport, subclass it and
reassign the protected `_fetch`.

## Documentation

| Topic                                                                             | Description                                         |
| --------------------------------------------------------------------------------- | --------------------------------------------------- |
| [Flows](https://github.com/TundraSoft/tundra-connect/wiki/DodoPayments-Flows)     | End-to-end payment, subscription and customer flows |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/DodoPayments-API)         | Client configuration and endpoint methods           |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/DodoPayments-Errors)   | Error codes and diagnostic metadata                 |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/DodoPayments-Schemas) | Public Guardian schemas and inferred types          |

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

```ts continued
const created = await client.createPayment({
  product_cart: [{ product_id: 'prd_1', quantity: 2 }],
  customer: { email: 'buyer@example.com', name: 'Ada' },
  billing: { country: 'DE' },
  payment_link: true,
  return_url: 'https://example.com/thanks',
});

console.log(created.payment_link); // send the buyer here
```

`created.client_secret` is a credential for confirming the payment from a
client SDK — never log it or expose it outside the buyer's own session.

### 2. Verify it actually completed

**Never trust the browser redirect.** The buyer controls it, and a
`?status=success` query parameter proves nothing. Confirm server-side:

```ts continued
const paymentId = created.payment_id;

if (await client.isPaid(paymentId)) {
  // Safe to fulfil the order.
}
```

Or inspect the full record when you need the detail:

```ts continued
const payment = await client.getPayment(created.payment_id);
payment.status; // 'succeeded' | 'processing' | 'requires_*' | ...
payment.total_amount; // 1999 === $19.99
payment.error_message; // set when status is 'failed'
```

### 3. Subscriptions

```ts continued
const sub = await client.createSubscription({
  product_id: 'prd_monthly',
  quantity: 1,
  customer: { customer_id: 'cus_1' },
  billing: { country: 'US' },
  payment_link: true,
  trial_period_days: 14,
});

// A created subscription is NOT yet active.
if (sub.payment_method_required) console.log(sub.payment_link); // send the buyer here

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

Move a subscription to another product, pause it, or hand the customer
Dodo's portal to manage it themselves:

```ts continued
// Upgrade now, crediting the unused part of the current cycle.
await client.changePlan('sub_1', {
  product_id: 'prd_pro_monthly',
  quantity: 1,
  proration_billing_mode: 'prorated_immediately',
});

// Keep a subscription that was set to cancel at period end.
await client.undoScheduledCancellation('sub_1');

// Pause and resume.
await client.pauseSubscription('sub_1');
await client.resumeSubscription('sub_1');

// A sign-in link to the customer portal. Send it only to that customer.
const { link } = await client.createCustomerPortalSession('cus_1', {
  returnUrl: 'https://example.com/account',
});
```

### 4. Show a customer what they have

Both list methods take `customerId`, and status comes back inline — no
follow-up fetch per record.

```ts continued
const customerId = 'cus_1';

const [customer, payments, subscriptions] = await Promise.all([
  client.getCustomer(customerId),
  client.listPayments({ customerId, pageSize: 20 }),
  client.listSubscriptions({ customerId }),
]);

const active = subscriptions.filter((s) => s.status === 'active');
const paid = payments.filter((p) => p.status === 'succeeded');
```

Filter server-side instead of paging and discarding:

```ts continued
await client.listPayments({ customerId: 'cus_1', status: 'succeeded' });
await client.listSubscriptions({ customerId: 'cus_1', status: 'active' });
```

Walk a full history with the auto-paging iterators:

```ts continued
for await (const p of client.listAllPayments({ customerId: 'cus_1' })) {
  console.log(p.payment_id, p.status);
}
```

Charge history for a single subscription:

```ts continued
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
import { DodoPayments } from '@tundraconnect/dodo-payments';

const client = new DodoPayments({
  auth: { type: 'BEARER', token: 'YOUR_API_KEY', prefix: 'Bearer' },
});

export async function onWebhook(req: Request): Promise<void> {
  // Note req.text() — NOT req.json().
  const raw = await req.text();
  const event = await client.verifyWebhook({
    payload: raw,
    headers: req.headers,
    secret: 'whsec_...',
  });
  // `event` is now trustworthy.
}
```

Verification is constant-time, enforces a 5-minute replay window in both
directions, and is deliberately sensitive to the raw bytes: re-serializing
parsed JSON changes whitespace and key order and will fail. That strictness
is the point — it guarantees you act on exactly the body that was signed.

### 6. Keep a product catalogue in sync

Put your own identifier in each product's `metadata`, and a re-sync finds
the product instead of creating a duplicate. Dodo cannot filter by
metadata, so `findProductsByMetadata` pages through the catalogue.

```ts continued
const planCode = 'pro_monthly';

const [existing] = await client.findProductsByMetadata(
  { plan_code: planCode },
  { includeArchived: true }, // an archived match is unarchived, not duplicated
);

if (!existing) {
  await client.createProduct({
    name: 'Pro (monthly)',
    tax_category: 'saas',
    price: {
      type: 'recurring_price',
      price: 1500, // $15.00
      currency: 'USD',
      payment_frequency_count: 1,
      payment_frequency_interval: 'Month',
      // Longer than the billing frequency, or the subscription expires
      // after one cycle instead of renewing.
      subscription_period_count: 20,
      subscription_period_interval: 'Year',
      trial_period_days: 14,
    },
    metadata: { plan_code: planCode },
  });
} else {
  await client.updateProduct(existing.product_id, { name: 'Pro (monthly)' });
}
```

To change a price without moving existing subscribers, create a new
product and `archiveProduct` the old one; `unarchiveProduct` puts a product
back on sale.

### 7. Create discount codes

A percentage `amount` is in basis points: `2000` is 20%. A flat code sets
its deduction per currency in `currency_options`.

```ts continued
const welcome = await client.createDiscount({
  type: 'percentage',
  amount: 2000,
  code: 'WELCOME20',
  subscription_cycles: 1, // the first payment only
  per_customer_usage_limit: 1,
  customer_eligibility: 'first_time',
  expires_at: '2026-12-31T23:59:59Z',
  metadata: { partner_id: 'acme' },
});

await client.createSubscription({
  product_id: 'prd_monthly',
  quantity: 1,
  customer: { email: 'buyer@example.com', name: 'Ada' },
  billing: { country: 'US' },
  discount_codes: [welcome.code],
  payment_link: true,
});
```

The request is checked before it is sent, and an unknown field is an error
rather than silently dropped. See
[Discounts](https://github.com/TundraSoft/tundra-connect/wiki/DodoPayments-API#discounts)
for flat codes, updates, the allow list, and applying a code to an existing
subscription.

### 8. Refund a payment

Without `items` the whole payment is refunded. To refund part of it, name
the payment's lines by product (or add-on) id, each with the amount to give
back in minor units, tax included.

```ts continued
// In full.
const refund = await client.createRefund({
  payment_id: 'pay_1',
  reason: 'Charged twice',
});

// In part: $5.00 of one product line.
await client.createRefund({
  payment_id: 'pay_2',
  items: [{ item_id: 'prd_1', amount: 500 }],
});

// A new refund is usually `pending`; only `succeeded` means the money went back.
const later = await client.getRefund(refund.refund_id);
console.log(later.status, later.amount, later.currency);
```

See
[Refunds](https://github.com/TundraSoft/tundra-connect/wiki/DodoPayments-API#refunds)
for the rules Dodo applies and how to read a payment's refunds.

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
