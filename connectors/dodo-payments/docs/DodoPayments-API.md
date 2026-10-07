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

Dodo numbers pages from 0. The first request **omits** `page_number`
(which Dodo reads as page 0), and later requests send `1`, `2`, … Dodo's
own SDK sends `2` after the first page and so skips page 1.

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

### `createCustomerPortalSession(customerId, options?)`

`POST /customers/{customer_id}/customer-portal/session` — a sign-in link to
Dodo's hosted portal, where the customer manages their subscriptions,
payment methods and invoices.

```ts
const { link } = await client.createCustomerPortalSession('cus_1', {
  returnUrl: 'https://example.com/account',
});
```

| Option      | Effect                                                    |
| ----------- | --------------------------------------------------------- |
| `sendEmail` | `true` also emails the link to the customer.              |
| `returnUrl` | Where the portal sends them back; overrides your default. |

> The link signs the customer in. Send it only to them and never log it.

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

### `undoScheduledCancellation(subscriptionId)`

`PATCH /subscriptions/{subscription_id}` with
`cancel_at_next_billing_date: false`. Withdraws a period-end cancellation,
so the subscription renews as normal. An immediate cancellation cannot be
undone.

### `pauseSubscription(subscriptionId)` / `resumeSubscription(subscriptionId)`

`PATCH /subscriptions/{subscription_id}` with `status: 'paused'` or
`status: 'active'`, sent alone because Dodo rejects either combined with
another field. Resuming also restarts an `on_hold` subscription that has an
unpaid pause invoice, and voids that invoice.

`resumeSubscription` is for a paused subscription. To keep one that is set
to cancel at period end, use `undoScheduledCancellation`: its status is
still `active`.

### `changePlan(subscriptionId, request)`

`POST /subscriptions/{subscription_id}/change-plan` — move a subscription to
another product, for an upgrade, a downgrade or a quantity change.

```ts
await client.changePlan('sub_1', {
  product_id: 'prd_pro_monthly',
  quantity: 1,
  proration_billing_mode: 'prorated_immediately',
});
```

| Field                      | Meaning                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `product_id`, `quantity`   | The new plan. Required.                                                                                                  |
| `proration_billing_mode`   | Required. See below.                                                                                                     |
| `effective_at`             | `'immediately'` (default) or `'next_billing_date'`.                                                                      |
| `on_payment_failure`       | `'prevent_change'` keeps the old plan until payment succeeds; `'apply_change'` (Dodo's default) switches anyway.         |
| `collect_via_payment_link` | Charge through a hosted checkout instead of the saved card. Needs an immediate change and `prevent_change`.              |
| `addons`                   | Addons for the new plan. An empty list removes existing ones.                                                            |
| `discount_codes`           | Replaces the subscription's discounts; `[]` removes them. See [Discounts](#applying-a-code-to-an-existing-subscription). |

| `proration_billing_mode` | Billing                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `prorated_immediately`   | Credits the unused part of the current cycle, then charges a full cycle of the new plan.  |
| `full_immediately`       | Charges the new plan in full, with no credit for the current cycle.                       |
| `difference_immediately` | An upgrade charges the difference now; a downgrade keeps the remainder as renewal credit. |
| `do_not_bill`            | Switches with no charge or credit; the billing cycle is unchanged.                        |

For a change charged to the saved payment method, every field of the result
is null; with `collect_via_payment_link`, `payment_link` is the checkout to
send the customer to. The outcome arrives as `subscription.plan_changed`
and `payment.succeeded` or `payment.failed` webhooks.

A second change while one is still pending fails with `CONFLICT` (vendor
code `PendingPlanChangeExists`).

### `cancelScheduledPlanChange(subscriptionId)`

`DELETE /subscriptions/{subscription_id}/change-plan/scheduled` — withdraw a
change made with `effective_at: 'next_billing_date'`. `NOT_FOUND` when
nothing is scheduled.

## Products

A product is what a customer pays for: a one-time price (a credit pack) or
a recurring price (a plan). Payments and subscriptions refer to it by
`product_id`.

### `createProduct(request)`

`POST /products`. Required: `name` (at most 100 characters),
`tax_category`, `price`.

```ts
const pack = await client.createProduct({
  name: 'Credit pack (500)',
  tax_category: 'saas',
  price: { type: 'one_time_price', price: 4900, currency: 'USD' },
  metadata: { pack_code: 'credits_500' },
});
```

`price` is either `{ type: 'one_time_price', price, currency, … }` or
`{ type: 'recurring_price', price, currency, payment_frequency_count,
payment_frequency_interval, subscription_period_count,
subscription_period_interval, trial_period_days?, … }`. Usage-based prices
can be read but not created here.

> **The subscription period is how long a subscription runs, not how often
> it bills.** When the two are equal (1 month billed monthly), the
> subscription runs one cycle and then expires. For an ongoing plan, set a
> long period such as `20` + `'Year'`.

`tax_category` is one of `digital_products`, `saas`, `e_book`, `edtech`,
`live_tutoring`.

### `getProduct(productId)`

`GET /products/{id}` — the full record, archived or not. `price` is a union
discriminated on `type`.

### `listProducts(options?)` / `listAllProducts(options?)`

`GET /products`. Filters: `archived`, `recurring`, `brandId`, plus paging.
Without `archived`, only live products are listed; `archived: true` lists
only archived ones. Each item carries the base amount in `price` and
`currency`, and the full price in `price_detail`.

`listAllProducts` pages the same way as `listAllPayments`.

### `findProductsByMetadata(match, options?)`

Every product whose `metadata` contains all entries of `match`. Dodo cannot
filter by metadata, so this pages through the catalogue: one request per
page, and a second pass over archived products with
`includeArchived: true`. Values compare strictly, so `{ seats: 5 }` does not
match `{ seats: '5' }`.

```ts
const [existing] = await client.findProductsByMetadata(
  { plan_code: 'pro_monthly' },
  { includeArchived: true },
);
```

Metadata values are strings, numbers or booleans, and keep their type.

### `updateProduct(productId, update)`

`PATCH /products/{id}`. Every field is optional; an update that changes
nothing is rejected locally. Dodo returns no body, so this resolves to
nothing; call `getProduct` for the new record.

To change a price without moving existing subscribers, create a new
product and archive the old one instead of updating `price`.

### `archiveProduct(productId)` / `unarchiveProduct(productId)`

`DELETE /products/{id}` takes a product off sale; Dodo calls this archiving.
`POST /products/{id}/unarchive` puts it back, and fails with `CONFLICT` for
a product that is not archived.

## Discounts

A discount code takes money off a payment or subscription. Codes are
redeemed through `discount_codes` on `createPayment`, `createSubscription`
and `changePlan` (up to 20, applied in order).

### `createDiscount(request)`

`POST /discounts`. Required: `type`, `amount`.

```ts
// 20% off the first payment, new customers only, once each.
const discount = await client.createDiscount({
  type: 'percentage',
  amount: 2000, // basis points: 2000 = 20%
  code: 'WELCOME20',
  subscription_cycles: 1,
  per_customer_usage_limit: 1,
  customer_eligibility: 'first_time',
  metadata: { partner_id: 'acme' },
});

// $5 off orders of $20 or more, until the end of the year.
await client.createDiscount({
  type: 'flat',
  amount: 500,
  currency_options: [
    {
      currency: 'USD',
      is_default: true,
      max_amount_possible: 500,
      minimum_subtotal: 2000,
    },
  ],
  expires_at: '2026-12-31T23:59:59Z',
});
```

| Field                      | Meaning                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `type`                     | `'percentage'` or `'flat'`. Dodo blocks `flat_per_unit` for new codes.                                                     |
| `amount`                   | Integer, at least 1. Basis points for `percentage` (`1500` = 15%, at most `10000`). For `flat`, see below.                 |
| `currency_options`         | Per currency: `max_amount_possible` (the `flat` deduction, or the `percentage` cap), `minimum_subtotal`, and `is_default`. |
| `code`                     | 3–16 characters. Dodo upper-cases it, and generates a random 16-character code when omitted.                               |
| `name`                     | Display name.                                                                                                              |
| `usage_limit`              | Total redemptions, at least 1. Unlimited when omitted.                                                                     |
| `per_customer_usage_limit` | Redemptions per customer; at most `usage_limit` when both are set.                                                         |
| `subscription_cycles`      | Billing cycles a subscription keeps the discount: `1` is the first payment only. Omitted or `null` is indefinite.          |
| `restricted_to`            | Product ids the code is limited to.                                                                                        |
| `starts_at`, `expires_at`  | RFC 3339 date-times with an offset. `expires_at` must be after `starts_at`.                                                |
| `customer_eligibility`     | `'any'` (default), `'first_time'`, `'existing'` or `'specific'` (only customers on the allow list).                        |
| `preserve_on_plan_change`  | `true` keeps the discount through `changePlan`. Defaults to `false`.                                                       |
| `metadata`                 | String, number or boolean values, the same shape as product metadata.                                                      |

> **Flat codes:** the deduction is each currency's
> `currency_options[].max_amount_possible`, in minor units. A `flat` code
> needs at least one currency option, and every option needs
> `max_amount_possible` (Dodo answers a missing one with 422
> `DISCOUNT_CURRENCY_OPTION_INVALID`). Dodo also requires `amount` and
> stores it, but it does not set the deduction: in test mode, `amount: 1`
> with `max_amount_possible: 250` took 250 off. Set `amount` to the
> default currency's deduction so the record reads sensibly. A lone
> currency option becomes the default.

The request is checked locally before it is sent. Unknown fields are
**rejected**, not dropped, because a misspelt `usageLimit` dropped silently
would create a code with no limit. Numbers and booleans must be real
numbers and booleans, not strings. The rules above (percentage range, flat
needs a currency option, each currency once with at most one default,
per-customer limit within the total, window order) fail with
`REQUEST_VALIDATION_ERROR`.

A taken code fails with `INVALID_REQUEST` (vendor code
`DISCOUNT_CODE_ALREADY_EXISTS`).

### `getDiscount(discountId)`

`GET /discounts/{discount_id}`. `NOT_FOUND` for an unknown or deleted
discount.

### `getDiscountByCode(code)`

`GET /discounts/code/{code}`. Dodo gives lookup by code its own path, so it
never has to guess whether a value is an id or a code. Matching ignores
case.

This is also a redemption check: an expired or used-up code fails with
`INVALID_REQUEST` (Dodo answers 422), not with the record. To read such a
code, list with `listDiscounts({ code })` and compare `code` exactly; the
`code` filter is a partial, case-insensitive match.

### `listDiscounts(options?)` / `listAllDiscounts(options?)`

`GET /discounts`. Deleted discounts are never listed. Each item is the full
record, the same as `getDiscount`'s.

| Option                    | Query param                 |
| ------------------------- | --------------------------- |
| `code`                    | `code` (partial match)      |
| `discountType`            | `discount_type`             |
| `active`                  | `active`                    |
| `productId`               | `product_id`                |
| `pageNumber` / `pageSize` | `page_number` / `page_size` |

`listAllDiscounts` pages the same way as `listAllPayments`.

### `updateDiscount(discountId, update)`

`PATCH /discounts/{discount_id}`: a partial update. Omitted fields are left
as they are, and the updated record is returned. An update that changes
nothing is rejected locally.

| To                                    | Send                                                      |
| ------------------------------------- | --------------------------------------------------------- |
| Make the per-customer limit unlimited | `per_customer_usage_limit: null`                          |
| Make the code valid immediately       | `starts_at: null`                                         |
| Remove the product restriction        | `restricted_to: []` (the list is replaced, not merged)    |
| Remove every currency option          | `currency_options: []` (the list is replaced, not merged) |

`type`, `amount`, `code`, `customer_eligibility`,
`preserve_on_plan_change`, `restricted_to`, `currency_options` and
`metadata` cannot be `null`: Dodo would ignore it. Dodo does not document
whether `null` clears `name`, `usage_limit`, `subscription_cycles` or
`expires_at`, so check the returned record. A `usage_limit` below
`times_used` is rejected by Dodo.

Changing a code does not change the discount on subscriptions that
already redeemed it.

### `deleteDiscount(discountId)`

`DELETE /discounts/{discount_id}`. Dodo soft-deletes the code: it stops
working and leaves every list and lookup, and it cannot be restored.
`NOT_FOUND` when it is already deleted.

### Allow list

A `customer_eligibility: 'specific'` code is redeemable only by the
customers on its allow list, and a new one starts with an empty list.

| Method                                           | Route                                                     |
| ------------------------------------------------ | --------------------------------------------------------- |
| `addDiscountCustomers(discountId, customerIds)`  | `POST /discounts/{discount_id}/customers`                 |
| `listDiscountCustomers(discountId, options?)`    | `GET /discounts/{discount_id}/customers`                  |
| `listAllDiscountCustomers(discountId, options?)` | Auto-paging counterpart.                                  |
| `removeDiscountCustomer(discountId, customerId)` | `DELETE /discounts/{discount_id}/customers/{customer_id}` |

```ts
await client.addDiscountCustomers('dsc_1', ['cus_1', 'cus_2']);
```

`addDiscountCustomers` takes 1 to 1000 ids, returns only the customers
added by that call, and is safe to repeat. Dodo rejects the whole call
(`INVALID_REQUEST`) when any id is not a customer of yours.
`removeDiscountCustomer` fails with `NOT_FOUND` for a customer not on the
list.

### Discounts on a subscription

A subscription record lists the discounts applied to it in `discounts`,
in stack order. `discount_id` and `discount_cycles_remaining` are Dodo's
deprecated single-discount fields.

| Read                                                       | Each `discounts` entry carries                                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `getSubscription`, and the cancel / pause / resume results | The discount record plus `position` and `cycles_remaining` (billing cycles still to go; `null` for a discount without a cycle limit). |
| `listSubscriptions`                                        | Only `discount_id` and `discount_cycles_remaining`.                                                                                   |

No field gives the date a subscription's discount ends. The entry's
`expires_at` is when the CODE stops being redeemable. Work the end out from
`cycles_remaining` and the billing period.

### Applying a code to an existing subscription

Dodo has no field or route for this on the subscription itself;
`PATCH /subscriptions/{id}` takes no discount. The documented route is a
plan change to the **same** product and quantity, with `discount_codes`
and `do_not_bill`:

```ts
const sub = await client.getSubscription('sub_1');
await client.changePlan(sub.subscription_id, {
  product_id: sub.product_id,
  quantity: sub.quantity,
  proration_billing_mode: 'do_not_bill', // no charge, cycle unchanged
  discount_codes: [
    // discount_codes REPLACES the stack: keep the current codes.
    ...(sub.discounts ?? []).flatMap((d) => (d.code ? [d.code] : [])),
    'LOYAL10',
  ],
});
```

- `discount_codes` replaces every discount on the subscription; `[]`
  removes them all. Omitted, only discounts created with
  `preserve_on_plan_change: true` survive a plan change.
- Checked in test mode on 2026-10-08: Dodo accepts the same-product
  change, takes no charge (it records a $0 payment), adds the new code
  with its full cycle count, and leaves the codes already applied with
  the cycles they had left. Sending only the new code removed the old
  one.
- Dodo's documented failures here include `DISCOUNT_ALREADY_USED_ON_SUBSCRIPTION`,
  `DISCOUNT_NOT_APPLICABLE_TO_NEW_PRODUCT` and
  `DISCOUNT_NOT_AVAILABLE_FOR_ON_DEMAND` (as `vendorCode`).

### Redeeming at checkout

`createPayment`, `createSubscription` and `changePlan` take
`discount_codes: string[]` (up to 20, applied in order). The single
`discount_code` field is deprecated by Dodo and cannot be combined with
`discount_codes`; a request with both is rejected locally.

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
