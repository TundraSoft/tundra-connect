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

---

[← Back to DodoPayments](../README.md)
