# Razorpay Schemas

The `@tundraconnect/razorpay/schemas` subpath exports Guardian validators
and inferred types. Every client method validates its options (and any
path parameter like an id) before sending, and validates the response
body before returning it.

```ts
import {
  type CreateOrderRequestSchema,
  CreateOrderRequestSchemaObject,
} from '@tundraconnect/razorpay/schemas';

const payload: unknown = { amount: 29900, currency: 'INR' };

const [error, options] = CreateOrderRequestSchemaObject.safeParse(payload);
if (error || !options) throw error;

const typedOptions: CreateOrderRequestSchema = options;
console.log(typedOptions.amount);
```

## Request Schemas

| Schema                                 | Purpose                                            |
| -------------------------------------- | -------------------------------------------------- |
| `CreateOrderRequestSchemaObject`       | Options accepted by `Razorpay.createOrder()`       |
| `CapturePaymentRequestSchemaObject`    | Options accepted by `Razorpay.capturePayment()`    |
| `CreatePaymentLinkRequestSchemaObject` | Options accepted by `Razorpay.createPaymentLink()` |
| `ListPaymentsRequestSchemaObject`      | Options accepted by `Razorpay.listPayments()`      |

`CreateOrderRequestSchemaObject` requires `amount` (a positive integer, in
the smallest currency unit) and `currency` (uppercase ISO 4217).
`CapturePaymentRequestSchemaObject` requires both `amount` and `currency`
— Razorpay rejects a capture whose `amount` doesn't equal the payment's
authorized amount. `CreatePaymentLinkRequestSchemaObject` requires only
`amount`; its `callback_method` field is modeled as the literal `'get'`
(Razorpay's only documented value) rather than a free-form string, so any
other value fails validation locally. `ListPaymentsRequestSchemaObject`
has no required field; `count` is capped at `100` and `skip` must be
non-negative, matching Razorpay's documented pagination limits.

## Response Schemas

| Schema                              | Endpoint                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `OrderSchemaObject`                 | `POST /orders`, `GET /orders/{id}`                                                               |
| `PaymentSchemaObject`               | `POST /payments/{id}/capture`, `GET /payments/{id}`, items of `ListPaymentsResponseSchemaObject` |
| `PaymentLinkSchemaObject`           | `POST /payment_links`                                                                            |
| `ListPaymentsResponseSchemaObject`  | `GET /payments` (the `{entity, count, items}` collection envelope)                               |
| `RazorpayErrorEnvelopeSchemaObject` | Vendor error envelopes on non-2xx responses                                                      |

Every response schema models the commonly-used subset of Razorpay's
resource shape and uses `.passthrough()` so any unmodeled field survives
parsing — just untyped — instead of being silently dropped.
`PaymentSchemaObject`'s `card_id`/`bank`/`wallet`/`vpa` fields are all
optional/nullable since exactly one is populated at a time, depending on
`method`.

### The `notes: []` response quirk

Razorpay's Orders and Payments endpoints return `notes` as an empty
**array** (`[]`) rather than an empty object (`{}`) when no notes were
set — even though `notes` is otherwise documented and populated as a
plain string-keyed object. `notesResponseGuard` (used by
`OrderSchemaObject` and `PaymentSchemaObject`) accepts either shape and
normalizes the empty-array case to `{}`, so `notes` is always
`Record<string, string>` after parsing regardless of which shape the
vendor happened to send. Request-side `notes` (accepted by
`CreateOrderRequestSchemaObject` / `CreatePaymentLinkRequestSchemaObject`,
via `notesGuard`) has no such quirk — it's always a plain object, capped
at 15 pairs with each value at most 256 characters.

## Common Validators

`keyIdGuard`, `amountGuard`, `currencyGuard`, `receiptGuard`, and
`notesGuard`/`notesResponseGuard` are reusable component validators for
Razorpay's key-id, amount, currency-code, receipt, and notes-map formats.
`amountGuard` enforces the paise convention described in
[API](Razorpay-API.md): a positive integer, never a decimal major-unit
amount.

## Error Envelope

`RazorpayErrorEnvelopeSchemaObject` validates Razorpay's `{ error: {...} }`
envelope. Only `code` and `description` are required on the nested error
detail; `field`, `source`, `step`, `reason`, and `metadata` are optional
— see [Errors](Razorpay-Errors.md) for how the envelope maps to a
`RazorpayError`.

---

[← Back to Razorpay](../README.md)
