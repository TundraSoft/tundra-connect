# Stripe Schemas

The `@tundraconnect/stripe/schemas` subpath exports Guardian validators and
inferred types. Every client method validates its options before sending,
and validates the response body before returning it.

```ts
import {
  type CreatePaymentIntentRequestSchema,
  CreatePaymentIntentRequestSchemaObject,
} from '@tundraconnect/stripe/schemas';

const payload: unknown = { amount: 1999, currency: 'usd' };

const [error, options] = CreatePaymentIntentRequestSchemaObject.safeParse(
  payload,
);
if (error || !options) throw error;

const typedOptions: CreatePaymentIntentRequestSchema = options;
console.log(typedOptions.amount);
```

## Request Schemas

| Schema                                   | Purpose                                            |
| ---------------------------------------- | -------------------------------------------------- |
| `CreatePaymentIntentRequestSchemaObject` | Options accepted by `Stripe.createPaymentIntent()` |
| `CreateCustomerRequestSchemaObject`      | Options accepted by `Stripe.createCustomer()`      |

`CreatePaymentIntentRequestSchemaObject` requires `amount` (a positive
integer, in the smallest currency unit) and `currency` (lowercase ISO 4217).
`payment_method_types` and `automatic_payment_methods` are mutually
exclusive on Stripe's side; that constraint is intentionally not enforced
locally — an incompatible combination surfaces as a vendor
`invalid_request_error` instead. `CreateCustomerRequestSchemaObject` has no
universally-required field.

## Response Schemas

| Schema                      | Endpoint                                             |
| --------------------------- | ---------------------------------------------------- |
| `PaymentIntentSchemaObject` | `POST /payment_intents`, `GET /payment_intents/{id}` |
| `CustomerSchemaObject`      | `POST /customers`                                    |
| `ErrorSchemaObject`         | Vendor error envelopes on non-2xx responses          |

Both response schemas model the commonly-used subset of Stripe's much
larger resource objects (Stripe's PaymentIntent alone documents ~40
fields) and use `.passthrough()` so any unmodeled field survives parsing —
just untyped — instead of being silently dropped. Loosely-shaped nested
objects (`last_payment_error`, `next_action`, `invoice_settings`) are
validated with `.passthrough()` too, since their exact shape varies by
error/action/settings type.

## Common Validators

`secretKeyGuard`, `paymentIntentIdGuard`, `currencyGuard`, and
`metadataGuard` are reusable component validators for Stripe's API-key,
resource-id, currency-code, and metadata-map formats. `AddressSchemaObject`
and `ShippingSchemaObject` are shared between the Customer request and
response shapes.

## Error Envelope

`ErrorSchemaObject` validates Stripe's `{ error: {...} }` envelope.
`error.type` is validated against the closed, documented 4-value enum
(`STRIPE_ERROR_TYPES`); `code`, `param`, `decline_code`, `charge`,
`payment_intent`, and `doc_url` are all optional — see
[Errors](Stripe-Errors.md) for how the envelope maps to a `StripeError`.

---

[← Back to Stripe](../README.md)
