# DodoPayments Schemas

Public Guardian schemas, exported from
`@tundraconnect/dodo-payments/schemas`.

```ts
import {
  CreatePaymentRequestSchemaObject,
  PaymentSchemaObject,
  SubscriptionSchemaObject,
} from '@tundraconnect/dodo-payments/schemas';
```

| Export                                      | Used for                                     |
| ------------------------------------------- | -------------------------------------------- |
| `CreatePaymentRequestSchemaObject`          | `POST /payments` body.                       |
| `CreatePaymentResponseSchemaObject`         | `POST /payments` result.                     |
| `PaymentSchemaObject`                       | `GET /payments/{id}` record.                 |
| `PaymentListItemSchemaObject`               | One entry of `GET /payments`.                |
| `PaymentListSchemaObject`                   | A `GET /payments` page.                      |
| `CreateSubscriptionRequestSchemaObject`     | `POST /subscriptions` body.                  |
| `CreateSubscriptionResponseSchemaObject`    | `POST /subscriptions` result.                |
| `SubscriptionSchemaObject`                  | A subscription record.                       |
| `SubscriptionListSchemaObject`              | A `GET /subscriptions` page.                 |
| `ProductCartItemSchemaObject`               | One product line.                            |
| `BillingAddressSchemaObject`                | Billing address.                             |
| `CustomerRequestSchemaObject`               | The `customer` field of a create request.    |
| `CustomerDetailsSchemaObject`               | The embedded customer summary.               |
| `CustomerSchemaObject`                      | A full customer record (`getCustomer`).      |
| `CustomerPortalSessionSchemaObject`         | `createCustomerPortalSession` result.        |
| `ChangePlanRequestSchemaObject`             | `POST /subscriptions/{id}/change-plan` body. |
| `ChangePlanResponseSchemaObject`            | `changePlan` result.                         |
| `ProrationBillingModeSchemaObject`          | Plan-change billing mode enum.               |
| `CreateProductRequestSchemaObject`          | `POST /products` body.                       |
| `UpdateProductRequestSchemaObject`          | `PATCH /products/{id}` body.                 |
| `ProductSchemaObject`                       | A product record.                            |
| `ProductListItemSchemaObject`               | One entry of `GET /products`.                |
| `ProductListSchemaObject`                   | A `GET /products` page.                      |
| `ProductPriceRequestSchemaObject`           | The price of a product being created.        |
| `PriceSchemaObject`                         | Any price Dodo returns.                      |
| `OneTimePriceSchemaObject`                  | A one-time price.                            |
| `RecurringPriceSchemaObject`                | A recurring price.                           |
| `UsageBasedPriceSchemaObject`               | A usage-based price (read-only).             |
| `ProductMetadataSchemaObject`               | Product metadata.                            |
| `CreateDiscountRequestSchemaObject`         | `POST /discounts` body.                      |
| `UpdateDiscountRequestSchemaObject`         | `PATCH /discounts/{id}` body.                |
| `DiscountCurrencyOptionRequestSchemaObject` | One `currency_options` entry of a request.   |
| `DiscountSchemaObject`                      | A discount record.                           |
| `DiscountCurrencyOptionSchemaObject`        | One `currency_options` entry of a record.    |
| `DiscountListSchemaObject`                  | A `GET /discounts` page.                     |
| `DiscountCustomerSchemaObject`              | One allow-list entry.                        |
| `DiscountCustomerListSchemaObject`          | An allow-list page.                          |
| `DiscountTypeSchemaObject`                  | Discount type enum.                          |
| `DiscountCustomerEligibilitySchemaObject`   | Customer eligibility enum.                   |
| `SubscriptionDiscountSchemaObject`          | A discount applied to a subscription.        |
| `TaxCategorySchemaObject`                   | Product tax category enum.                   |
| `IntentStatusSchemaObject`                  | Payment status enum.                         |
| `SubscriptionStatusSchemaObject`            | Subscription status enum.                    |
| `TimeIntervalSchemaObject`                  | Billing recurrence unit.                     |
| `ErrorResponseSchemaObject`                 | The `{ code, message }` failure envelope.    |

Constants: `INTENT_STATUSES`, `SUBSCRIPTION_STATUSES`, `TIME_INTERVALS`,
`TAX_CATEGORIES`, `PRORATION_BILLING_MODES`, `PLAN_CHANGE_EFFECTIVE_AT`,
`PLAN_CHANGE_ON_PAYMENT_FAILURE`, `DISCOUNT_TYPES`,
`DISCOUNT_CUSTOMER_ELIGIBILITIES`.

## Prices

`PriceSchema` is a union discriminated on `type`, so checking `type`
narrows it:

```ts
import { PriceSchemaObject } from '@tundraconnect/dodo-payments/schemas';

const [, price] = PriceSchemaObject.safeParse({
  type: 'recurring_price',
  price: 1500,
  currency: 'USD',
  payment_frequency_count: 1,
  payment_frequency_interval: 'Month',
  subscription_period_count: 20,
  subscription_period_interval: 'Year',
});
if (price?.type === 'recurring_price') {
  console.log(price.payment_frequency_interval); // 'Month'
}
```

Amounts are integers in the currency's smallest unit, and `currency` is an
uppercase ISO 4217 code. A request price may be one-time or recurring; a
response may also be usage-based, whose meter fields pass through untyped.

## Discounts

The discount request schemas are **strict**: an unknown field is an error,
not a dropped key, and numbers and booleans are not coerced from strings.
They also check Dodo's cross-field rules, so a code that could never be
created fails before it is sent.

```ts
import { CreateDiscountRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';

const [error] = CreateDiscountRequestSchemaObject.safeParse({
  type: 'percentage',
  amount: 2000,
  usageLimit: 5, // typo
});
error?.message; // "Unknown property 'usageLimit' is not allowed in strict mode"
```

On a discount record, `type` and `customer_eligibility` are typed as
`string`, so a legacy `flat_per_unit` discount or a new eligibility value
still reads. Discount metadata has the same shape as product metadata.

`SubscriptionDiscountSchemaObject` reads both shapes Dodo uses for a
subscription's `discounts`: the full one from `getSubscription` and the
short one from `listSubscriptions`. Only `discount_id` is required.

## Product metadata

Product metadata values are strings, numbers or booleans, and keep their
type through validation: `5` stays a number and `'5'` stays a string. This
differs from subscription and customer metadata, which Dodo returns as
strings. `tax_category` on a product read is typed as `string`, so a
category Dodo adds later does not fail the read.

## Status enums

`IntentStatusSchema` has eleven values and only `succeeded` means money
moved. `processing` and the `requires_*` family are explicitly **not**
success — see [API](DodoPayments-API.md#ispaidpaymentid).

`TimeIntervalSchema` is case-sensitive and capitalized: `Day`, `Week`,
`Month`, `Year`. `'month'` is rejected.

## `CustomerSchema` vs `CustomerDetailsSchema`

Two different customer shapes, and it matters which you are holding:

- **`CustomerDetailsSchema`** is the summary _embedded_ in a payment or
  subscription — `customer_id`, `email`, `name`, optional phone/metadata.
- **`CustomerSchema`** is the full record from `getCustomer`, adding
  `business_id`, `created_at` and the blocklist fields.

`blocked_at` is resolved only by the single-customer route; the vendor
leaves it empty on list responses, so absent means "not reported", not
"not blocked".

## `CustomerRequestSchema`

A union, matching the vendor: **either** `{ customer_id }` **or**
`{ email, name?, phone_number? }`. Passing neither is rejected locally
rather than producing an opaque 422.

## Response schemas pass unknown fields through

`PaymentSchema` and `SubscriptionSchema` both use `.passthrough()`. Dodo's
payment object carries settlement, dispute, refund and discount families,
and its subscription object carries addons, meters and credit
entitlements — all outside this connect's scope and all actively growing.

A closed shape would turn any additive vendor change into a
`RESPONSE_ERROR` on a status check for a payment that already succeeded —
the worst possible moment to start failing.

`status` on a payment is optional **and** nullable, because the vendor
types it that way. Treat a missing status as unknown, never as success.

## List pages normalize defensively

`PaymentListSchema` and `SubscriptionListSchema` wrap
`{ items: [...] }`, with two normalizations applied in a single top-level
`Guardian.preprocess`:

- An **absent** `items` becomes `[]` — "this customer has no payments" is
  an ordinary answer, not a failure.
- A **bare array** body is treated as the items themselves, so results are
  never silently dropped in favour of an empty page if the vendor returns
  a naked array.

A scalar body is still rejected.

> The normalization is one top-level `preprocess` wrapping the whole
> object, never a per-field one: a `Guardian.preprocess` used _as_ a
> `Guardian.object()` field's value silently skips its transform. See
> `CONVENTIONS.md`.

## Billing

`billing.country` is required on every create call — Dodo is a merchant of
record and derives tax treatment from it. The rest of the address is
optional and accepts explicit `null`s, which is how the vendor returns
unset fields.

---

[← Back to DodoPayments](../README.md)
