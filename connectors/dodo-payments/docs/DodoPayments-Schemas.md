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

| Export                                   | Used for                                  |
| ---------------------------------------- | ----------------------------------------- |
| `CreatePaymentRequestSchemaObject`       | `POST /payments` body.                    |
| `CreatePaymentResponseSchemaObject`      | `POST /payments` result.                  |
| `PaymentSchemaObject`                    | `GET /payments/{id}` record.              |
| `PaymentListItemSchemaObject`            | One entry of `GET /payments`.             |
| `PaymentListSchemaObject`                | A `GET /payments` page.                   |
| `CreateSubscriptionRequestSchemaObject`  | `POST /subscriptions` body.               |
| `CreateSubscriptionResponseSchemaObject` | `POST /subscriptions` result.             |
| `SubscriptionSchemaObject`               | A subscription record.                    |
| `SubscriptionListSchemaObject`           | A `GET /subscriptions` page.              |
| `ProductCartItemSchemaObject`            | One product line.                         |
| `BillingAddressSchemaObject`             | Billing address.                          |
| `CustomerRequestSchemaObject`            | The `customer` field of a create request. |
| `CustomerDetailsSchemaObject`            | The embedded customer summary.            |
| `CustomerSchemaObject`                   | A full customer record (`getCustomer`).   |
| `IntentStatusSchemaObject`               | Payment status enum.                      |
| `SubscriptionStatusSchemaObject`         | Subscription status enum.                 |
| `TimeIntervalSchemaObject`               | Billing recurrence unit.                  |
| `ErrorResponseSchemaObject`              | The `{ code, message }` failure envelope. |

Constants: `INTENT_STATUSES`, `SUBSCRIPTION_STATUSES`, `TIME_INTERVALS`.

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
