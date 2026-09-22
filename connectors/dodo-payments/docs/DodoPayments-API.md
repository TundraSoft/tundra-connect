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

### `verifyWebhookSignature(options)`

Not an HTTP call — a standalone export. See
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
