# DodoPayments Flows

End-to-end usage: taking a one-time payment, starting a subscription, and
showing a customer what they have bought. For per-method reference see
[API](DodoPayments-API.md).

Both purchase flows share the same four beats, because both use Dodo's
hosted checkout:

**create → redirect → buyer pays → you verify server-side**

What differs is _what_ you create, what "done" means, and what happens
afterwards.

## Setup

```ts
import { DodoPayments } from '@tundraconnect/dodo-payments';

const dodo = new DodoPayments({
  auth: { type: 'BEARER', token: API_KEY, prefix: 'Bearer' },
  // `mode` defaults to 'test'. Pass mode: 'live' for real money.
});
```

## One-time payment, new customer

```ts
// 1. Create. A new customer is just { email, name } — no separate
//    registration step, Dodo creates one for you.
const created = await dodo.createPayment({
  product_cart: [{ product_id: 'prd_1', quantity: 1 }],
  customer: { email: 'buyer@example.com', name: 'Ada' },
  billing: { country: 'US' }, // required — Dodo is merchant of record
  payment_link: true, // ask for a hosted checkout URL
  return_url: 'https://you.app/thanks',
  metadata: { order_id: 'ord_42' }, // your own correlation id
});

// 2. Store the customer id Dodo just minted. This is the ONLY place you
//    are handed it, and without it every later call creates a duplicate
//    customer by email instead of reusing this one.
await db.users.update(userId, { dodoCustomerId: created.customer.customer_id });
await db.orders.update('ord_42', { paymentId: created.payment_id });

// 3. Send them to checkout.
redirect(created.payment_link!);
```

The buyer pays and Dodo bounces them to `return_url`. **That redirect
proves nothing** — it is under the buyer's control, and
`?status=success` is not evidence. Confirm server-side:

```ts
// On the return_url handler — for UX only ("confirming your order…").
if (await dodo.isPaid(paymentId)) showSuccess();
```

Fulfilment itself belongs on the webhook, not the redirect: the buyer may
close the tab before it ever fires.

## Subscription, new customer

```ts
// 1. Create. Same customer shape; product_id instead of a cart.
const sub = await dodo.createSubscription({
  product_id: 'prd_monthly',
  quantity: 1,
  customer: { email: 'buyer@example.com', name: 'Ada' },
  billing: { country: 'US' },
  payment_link: true,
  return_url: 'https://you.app/welcome',
  trial_period_days: 14, // optional
});

// 2. Three ids to store, not one.
await db.users.update(userId, {
  dodoCustomerId: sub.customer.customer_id,
  dodoSubscriptionId: sub.subscription_id,
});
// sub.payment_id is the FIRST charge — a separate object from the
// subscription itself.

// 3. Redirect only if a mandate is still needed.
if (sub.payment_method_required) redirect(sub.payment_link!);
```

Confirming a subscription is a **different check** from confirming a
payment:

```ts
const live = await dodo.getSubscription(sub.subscription_id);
if (live.status === 'active') grantAccess();
// 'pending' means they have not finished checkout yet.
```

After that there is no redirect ever again. **Renewals are webhook-only** —
the part integrations most often miss.

## The webhook handler

Fulfilment belongs here, for both flows.

```ts
export async function POST(req: Request) {
  const raw = await req.text(); // text(), never json()
  let event;
  try {
    event = await dodo.verifyWebhook({
      payload: raw,
      headers: req.headers,
      secret: WEBHOOK_SIGNING_SECRET,
    });
  } catch {
    return new Response('bad signature', { status: 400 }); // forged or replayed
  }

  const { type, data } = event as {
    type: string;
    data: Record<string, unknown>;
  };

  // Dodo retries, so key idempotency on the delivery id and no-op a repeat.
  const deliveryId = req.headers.get('webhook-id')!;
  if (await alreadyHandled(deliveryId)) return new Response('ok');

  switch (type) {
    case 'payment.succeeded':
      await fulfil(data.payment_id);
      break;
    case 'payment.failed':
      await notifyFailure(data.payment_id);
      break;

    case 'subscription.active':
      await grantAccess(data.subscription_id);
      break;
    case 'subscription.renewed':
      await extendAccess(data.subscription_id);
      break;
    case 'subscription.past_due':
      await startDunning(data.subscription_id);
      break;
    case 'subscription.on_hold':
    case 'subscription.cancelled':
    case 'subscription.expired':
      await revokeAccess(data.subscription_id);
      break;
  }

  await markHandled(deliveryId);
  return new Response('ok');
}
```

The delivered envelope is `{ business_id, type, timestamp, data }`, and
`data` is the **full** payment or subscription object (plus a
`payload_type` discriminator) — so a follow-up `getPayment` is usually
unnecessary. Re-fetch when ordering matters: `data` is "latest at delivery
attempt", not necessarily at event time.

Event types: `payment.succeeded` / `failed` / `processing` / `cancelled`,
and `subscription.active` / `renewed` / `on_hold` / `past_due` / `paused` /
`unpaused` / `cancelled` / `expired` / `failed` / `updated` /
`plan_changed` / `update_payment_method`.

## Showing a customer what they have

```ts
const [customer, payments, subscriptions] = await Promise.all([
  dodo.getCustomer(customerId),
  dodo.listPayments({ customerId, pageSize: 20 }),
  dodo.listSubscriptions({ customerId }),
]);

return {
  profile: { email: customer.email, since: customer.created_at },
  activeSubscriptions: subscriptions.filter((s) => s.status === 'active'),
  paidPayments: payments.filter((p) => p.status === 'succeeded'),
};
```

Push filters server-side rather than paging and discarding:

```ts
await dodo.listPayments({ customerId, status: 'succeeded' });
await dodo.listSubscriptions({ customerId, status: 'active' });
```

For a full history, the auto-paging iterators walk every page:

```ts
for await (const p of dodo.listAllPayments({ customerId })) {
  console.log(p.payment_id, p.status);
}

const all = await Array.fromAsync(dodo.listAllSubscriptions({ customerId }));
```

Charge history for one subscription:

```ts
const renewals = await dodo.listPayments({ subscriptionId: 'sub_1' });
```

## Cancelling

```ts
// Immediately — revokes the mandate, no further charge possible.
await dodo.cancelSubscription('sub_1');

// At the end of the paid period.
const ended = await dodo.cancelSubscription('sub_1', {
  atPeriodEnd: true,
  comment: 'Downgrading to free',
});
ended.status; // still 'active'
ended.cancel_at_next_billing_date; // true
```

## Changing plan

```ts
// Upgrade now: credit the unused part of this cycle, charge the new plan.
await dodo.changePlan('sub_1', {
  product_id: 'prd_pro_monthly',
  quantity: 1,
  proration_billing_mode: 'prorated_immediately',
});

// Downgrade at renewal instead, and change your mind later.
await dodo.changePlan('sub_1', {
  product_id: 'prd_starter_monthly',
  quantity: 1,
  proration_billing_mode: 'do_not_bill',
  effective_at: 'next_billing_date',
});
await dodo.cancelScheduledPlanChange('sub_1');
```

Act on the `subscription.plan_changed` webhook rather than on the call's
result: with `on_payment_failure: 'prevent_change'`, the plan changes only
once the payment succeeds.

To let customers change plans, update cards and download invoices
themselves, send them a portal link from
`createCustomerPortalSession(customerId)`.

## Syncing a product catalogue

Keep plans and packs in your own database and push them to Dodo, keyed by
an identifier of yours in each product's `metadata`:

```ts
type Plan = { code: string; name: string; monthlyCents: number };

async function syncPlan(plan: Plan): Promise<string> {
  const [existing] = await dodo.findProductsByMetadata(
    { plan_code: plan.code },
    { includeArchived: true },
  );
  if (existing) {
    await dodo.updateProduct(existing.product_id, { name: plan.name });
    return existing.product_id;
  }
  const created = await dodo.createProduct({
    name: plan.name,
    tax_category: 'saas',
    price: {
      type: 'recurring_price',
      price: plan.monthlyCents,
      currency: 'USD',
      payment_frequency_count: 1,
      payment_frequency_interval: 'Month',
      subscription_period_count: 20,
      subscription_period_interval: 'Year',
    },
    metadata: { plan_code: plan.code },
  });
  return created.product_id;
}
```

A price change is a new product: create it with a new code, point new
checkouts at it, and `archiveProduct` the old one. Existing subscribers stay
on the product they bought until you `changePlan` them.

`findProductsByMetadata` lists every product page by page, since Dodo
cannot filter by metadata. For a large catalogue, store the returned
`product_id` against your plan and look it up with `getProduct` instead.

## Syncing discount codes

Keep codes in your own database and push them to Dodo, keyed by the code
itself. Dodo upper-cases codes, so store them upper-cased too.

```ts
import type { DiscountSchema } from '@tundraconnect/dodo-payments';

type Promo = {
  code: string; // upper-case, 3–16 characters
  percentOff: number;
  firstPaymentOnly: boolean;
  partnerId: string;
  endsAt: string; // RFC 3339, e.g. '2026-12-31T23:59:59Z'
};

async function syncPromo(promo: Promo): Promise<string> {
  // getDiscountByCode fails for an expired or used-up code, so look the
  // code up in the list. Its filter is a partial match: compare exactly.
  let existing: DiscountSchema | undefined;
  for await (const d of dodo.listAllDiscounts({ code: promo.code })) {
    if (d.code === promo.code) {
      existing = d;
      break;
    }
  }
  const fields = {
    type: 'percentage' as const,
    amount: promo.percentOff * 100, // basis points
    // Dodo does not document whether null clears the count on an update;
    // check the returned record when turning a limited code indefinite.
    subscription_cycles: promo.firstPaymentOnly ? 1 : null,
    expires_at: promo.endsAt,
    metadata: { partner_id: promo.partnerId },
  };
  if (existing) {
    await dodo.updateDiscount(existing.discount_id, fields);
    return existing.discount_id;
  }
  const created = await dodo.createDiscount({ ...fields, code: promo.code });
  return created.discount_id;
}
```

A deleted code is gone for good and never listed, so a sync that finds
nothing creates a new one under the same code.

To give a current subscriber a code, change plan to the same product with
`do_not_bill`; see
[Applying a code to an existing subscription](DodoPayments-API.md#applying-a-code-to-an-existing-subscription).

## Flow comparison

|                        | One-time                         | Subscription                           |
| ---------------------- | -------------------------------- | -------------------------------------- |
| Create returns         | `payment_id`                     | `subscription_id` **and** `payment_id` |
| Redirect gate          | always (with `payment_link`)     | only if `payment_method_required`      |
| "Done" means           | payment `status === 'succeeded'` | subscription `status === 'active'`     |
| Helper                 | `isPaid(paymentId)`              | `getSubscription(id)` → check `status` |
| After the first charge | nothing                          | renewals forever, webhook-only         |
| Ongoing failure mode   | none                             | `past_due` → `on_hold` dunning ladder  |

## Pitfalls

1. **Capture `customer.customer_id` from the create response.** It is the
   only place you get it. A second purchase should pass `{ customer_id }`,
   not `{ email }`, or you accumulate duplicate customers.
2. **A created subscription is not an active one.**
   `payment_method_required: true` means they have not paid; the
   subscription sits in `pending`. Granting access on the create response
   gives the product away.
3. **Never trust the redirect.** Confirm with `isPaid` or a verified
   webhook.
4. **Only `succeeded` means paid.** `processing` and every `requires_*`
   state mean the money has not settled. A payment's `status` is also
   optional and nullable — absent is _unknown_, never success.
5. **A period-end cancellation stays `active`.** Read
   `cancel_at_next_billing_date`.
6. **Amounts are the currency's smallest unit.** `1999` is $19.99.
7. **A subscription period equal to the billing frequency expires.** A
   product billed monthly with a one-month period runs a single cycle. Use
   a long period, such as 20 years, for an ongoing plan.
8. **Archived products are listed separately.** A sync that searches only
   live products creates a duplicate of an archived one; pass
   `includeArchived: true`.
9. **A percentage discount is in basis points.** `amount: 15` is 0.15%,
   not 15%; 15% is `1500`.
10. **`discount_codes` on a plan change replaces the stack.** List the
    codes to keep, or every discount without `preserve_on_plan_change`
    is lost.

---

[← Back to DodoPayments](../README.md)
