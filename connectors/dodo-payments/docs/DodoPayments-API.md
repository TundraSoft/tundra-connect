# DodoPayments API

Client configuration and endpoint methods for
`@tundraconnect/dodo-payments`.

## Configuration

```ts
import { DodoPayments } from '@tundraconnect/dodo-payments';

const client = new DodoPayments({
  auth: { type: 'BEARER', token: 'YOUR_API_KEY', prefix: 'Bearer' },
  mode: 'test', // the default
});
```

| Option    | Type               | Required | Default             | Description                           |
| --------- | ------------------ | -------- | ------------------- | ------------------------------------- |
| `auth`    | `DodoPaymentsAuth` | yes      | —                   | `{ type: 'BEARER', token, prefix? }`. |
| `mode`    | `'test' \| 'live'` | no       | `'test'`            | Which environment to talk to.         |
| `baseURL` | `string`           | no       | derived from `mode` | Overrides `mode` entirely.            |
| `timeout` | `number`           | no       | `30`                | Request timeout in seconds.           |

**`mode` defaults to `'test'`.** This client moves real money, so the safe
environment is the one you get by omission. API keys are
environment-specific — a test key will not work against the live host.

| Mode     | Host                            |
| -------- | ------------------------------- |
| `'test'` | `https://test.dodopayments.com` |
| `'live'` | `https://live.dodopayments.com` |

### Getters

| Getter   | Type               | Description              |
| -------- | ------------------ | ------------------------ |
| `vendor` | `string`           | Always `'DodoPayments'`. |
| `mode`   | `'test' \| 'live'` | The environment in use.  |

## Amounts

Every amount is an integer in the currency's **smallest unit** — cents for
USD, yen for JPY, fils for KWD. `1999` is $19.99.

## Payments

### `createPayment(request)`

`POST /payments` — initialize a one-time payment.

Required: `product_cart`, `customer`, `billing`. Pass `payment_link: true`
for a hosted checkout URL.

```ts
const created = await client.createPayment({
  product_cart: [{ product_id: 'prd_1', quantity: 2 }],
  customer: { email: 'buyer@example.com', name: 'Ada' }, // or { customer_id }
  billing: { country: 'DE' },
  payment_link: true,
  return_url: 'https://example.com/thanks',
});
```

Returns `payment_id`, `total_amount`, `client_secret`, `customer`, and
`payment_link` when requested.

> `client_secret` is a credential. Never log it or expose it beyond the
> buyer's own session.

### `getPayment(paymentId)`

`GET /payments/{payment_id}` — the full payment record.

This is the authoritative post-checkout check. **Never trust the browser
redirect**: the buyer controls it, and `?status=success` proves nothing.

### `isPaid(paymentId)`

`getPayment` reduced to a boolean. `true` **only** when
`status === 'succeeded'`.

| Status                 | `isPaid` | Meaning                          |
| ---------------------- | -------- | -------------------------------- |
| `succeeded`            | `true`   | Funds captured.                  |
| `processing`           | `false`  | In flight — nothing settled yet. |
| `requires_*`           | `false`  | Awaiting an action.              |
| `failed` / `cancelled` | `false`  | Will not complete.               |
| `partially_captured`   | `false`  | Only part captured.              |
| absent / `null`        | `false`  | Unknown — never assume success.  |

### `listPayments(options?)`

`GET /payments` — one page of payment summaries. Pass `customerId` for a
single customer's order history.

| Option                          | Query param                         |
| ------------------------------- | ----------------------------------- |
| `customerId`                    | `customer_id`                       |
| `subscriptionId`                | `subscription_id`                   |
| `productId` / `brandId`         | `product_id` / `brand_id`           |
| `status`                        | `status`                            |
| `createdAtGte` / `createdAtLte` | `created_at_gte` / `created_at_lte` |
| `pageNumber` / `pageSize`       | `page_number` / `page_size`         |

Returns the `items` array directly. List records are **lighter** than
`getPayment`'s: no refunds, disputes or product cart.

### `listAllPayments(options?)`

Auto-paging counterpart to `listPayments` — an `AsyncGenerator` that walks
every page.

```ts
for await (const p of client.listAllPayments({ customerId })) {
  console.log(p.payment_id, p.status);
}

const all = await Array.fromAsync(client.listAllPayments({ customerId }));
```

Takes the same filters as `listPayments` minus `pageNumber` (it manages
that), plus `maxPages`.

| Option     | Default | Description                                  |
| ---------- | ------- | -------------------------------------------- |
| `pageSize` | `100`   | Requested per page; the vendor may clamp it. |
| `maxPages` | `1000`  | Safety ceiling — see below.                  |

Paging matches Dodo's own SDK exactly: the first request **omits**
`page_number` (the vendor reads that as page one), and later requests send
`2`, `3`, …

Iteration stops on the first **empty** page, not a short one. The vendor
may clamp `page_size` below what was asked for, and treating a clamped
page as the last would silently truncate the history.

`maxPages` exists for the one case that cannot terminate on its own: an
endpoint that ignored `page_number` and kept returning the same full page
would spin forever against a rate-limited, money-handling API.

> Prefer `listPayments` when one page is enough — the iterator issues one
> request per page.

## Customers

### `getCustomer(customerId)`

`GET /customers/{customer_id}` — the full customer record.

```ts
const customer = await client.getCustomer('cus_1');
customer.email;
customer.created_at;
customer.blocked_at; // set only when the merchant blocked them
```

Richer than the customer summary embedded in a payment or subscription: it
adds `business_id`, `created_at` and the blocklist fields.

> `blocked_at` is resolved **only** by this single-customer route — the
> vendor leaves it empty on list responses, so absent means "not
> reported", not "not blocked".

Where does `customer_id` come from? `createPayment` and
`createSubscription` return it on `.customer` even when you identified the
customer only by email. Store it then — it is the only place it is handed
to you.

## Querying by customer

Both list methods take `customerId`, and **status comes back inline** — no
follow-up fetch per record.

```ts
const [customer, payments, subscriptions] = await Promise.all([
  client.getCustomer(customerId),
  client.listPayments({ customerId, pageSize: 20 }),
  client.listSubscriptions({ customerId }),
]);
```

Filter server-side rather than paging and discarding:

```ts
await client.listPayments({ customerId, status: 'succeeded' });
await client.listSubscriptions({ customerId, status: 'active' });
```

Charge history for one subscription:

```ts
await client.listPayments({ subscriptionId: 'sub_1' });
```

### Two asymmetries

**Payment status is optional; subscription status is not.**

```ts
p.status; // IntentStatus | null | undefined  ← handle absent
s.status; // SubscriptionStatus              ← always present
```

Never infer success from "not failed". Absent is _unknown_, and only
`'succeeded'` means money moved.

**The list records differ in weight.** `listSubscriptions` returns the
_full_ subscription object — identical to `getSubscription`, so no
follow-up is ever needed. `listPayments` returns a _lighter_ record,
dropping `refunds`, `disputes`, `product_cart`, `billing` and
`error_code` / `error_message`. Fetch detail only for the rows that need
it:

```ts
const failed = payments.filter((p) => p.status === 'failed');
const detailed = await Promise.all(
  failed.map((p) => client.getPayment(p.payment_id)),
);
detailed[0]?.error_message; // 'The card was declined.'
```

## Subscriptions

### `createSubscription(request)`

`POST /subscriptions`. Required: `product_id`, `quantity`, `customer`,
`billing`.

A created subscription is **not yet active**. When
`payment_method_required` is `true`, the customer must still complete
checkout at `payment_link`; the subscription sits in `pending` until then.

### `getSubscription(subscriptionId)`

`GET /subscriptions/{subscription_id}`.

### `listSubscriptions(options?)`

`GET /subscriptions`. Same filter style as `listPayments`
(`customerId`, `productId`, `brandId`, `status`, date bounds, paging).

### `listAllSubscriptions(options?)`

Auto-paging counterpart to `listSubscriptions`. Same paging, termination
and `maxPages` rules as `listAllPayments`.

```ts
for await (const s of client.listAllSubscriptions({ customerId })) {
  console.log(s.subscription_id, s.status);
}
```

### `cancelSubscription(subscriptionId, options?)`

`PATCH /subscriptions/{subscription_id}`.

| Option        | Effect                                                                   |
| ------------- | ------------------------------------------------------------------------ |
| _(default)_   | Cancels immediately — sends `status: 'cancelled'`, revoking the mandate. |
| `atPeriodEnd` | Sends `cancel_at_next_billing_date: true`; access lasts the paid period. |
| `comment`     | Stored as `cancellation_comment`.                                        |

> **Reading the result of a period-end cancellation:** the vendor leaves
> `status` as `'active'` until the date arrives and records the intent in
> `cancel_at_next_billing_date`. Checking `status` alone will tell you the
> cancellation did not take.

## Webhooks

### `verifyWebhook(options)`

Not an HTTP call — a method on the client (the signing secret is passed per call; it is not the API key). The HMAC stays on Web Crypto because Standard Webhooks keys the MAC with the base64-_decoded_ secret, which `@tundralibs/crypt`'s string-keyed `signHMAC` cannot express; the constant-time comparison does come from crypt. `DodoPayments.webhookSignedContent(id, ts, payload)` exposes the exact signed string. See
[the README](../README.md#5-verify-webhooks) and
[Errors](DodoPayments-Errors.md#webhook-codes).

| Option             | Type                | Default      | Description                             |
| ------------------ | ------------------- | ------------ | --------------------------------------- |
| `payload`          | `string`            | —            | The **raw** body. Never re-serialized.  |
| `headers`          | `Headers \| object` | —            | Case-insensitive lookup.                |
| `secret`           | `string`            | —            | With or without the `whsec_` prefix.    |
| `toleranceSeconds` | `number`            | `300`        | Replay window, checked both directions. |
| `nowMs`            | `number`            | `Date.now()` | Clock override for tests.               |

Returns the parsed payload on success — so the verified object is the
natural thing to act on, and there is no unverified copy to reach for by
mistake.

---

[← Back to DodoPayments](../README.md)
