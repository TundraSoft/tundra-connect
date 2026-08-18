# PayPal Schemas

The `@tundraconnect/paypal/schemas` subpath exports Guardian validators and
inferred types for every request/response shape this connect uses.

```ts
import {
  MoneySchemaObject,
  OrderSchemaObject,
} from '@tundraconnect/paypal/schemas';

const [error, money] = MoneySchemaObject.safeParse({
  currency_code: 'USD',
  value: '10.00',
});
```

## `Common.ts`

- **`MoneySchema`/`MoneySchemaObject`** — `{ currency_code, value }`.
  `value` is a **decimal STRING**, never a number (`"10.00"`, or `"100"` for
  a zero-decimal currency like JPY) — matching
  `pattern: "^((-?[0-9]+)|(-?([0-9]+)?[.][0-9]+))$"`, confirmed against
  PayPal's published OpenAPI spec. `currency_code` is validated as exactly
  3 characters (PayPal's own schema doesn't further constrain it — it
  relies on its supported-currency list to reject anything invalid).
- **`LinkSchema`/`LinkSchemaObject`** — `{ href, rel, method? }`, a HATEOAS
  link as returned on every order/capture/refund's `links` array.

## `Order.ts`

- **`AmountBreakdownSchema`** — optional `item_total`/`shipping`/`handling`/
  `tax_total`/`insurance`/`shipping_discount`/`discount` sub-totals, each a
  `MoneySchema`.
- **`OrderAmountSchema`** — a purchase unit's total `amount`: `MoneySchema`
  plus an optional `breakdown`.
- **`ItemSchema`** — one purchase-unit line item. `quantity` is a
  positive-integer STRING matching `^[1-9][0-9]{0,9}$` (also confirmed
  against PayPal's spec) — not a number.
- **`PayeeSchema`** — `{ email_address?, merchant_id? }`.
- **`ApplicationContextSchema`** — `{ brand_name?, return_url?, cancel_url?,
  user_action? }`.
- **`PurchaseUnitRequestSchema`** — one purchase unit of a `createOrder`
  request.
- **`CreateOrderRequestSchema`/`CreateOrderRequestSchemaObject`** —
  `createOrder`'s request body: `{ intent, purchase_units, application_context?, payer? }`.
- **`CaptureSchema`** — one captured payment (`purchase_units[].payments.captures[]`).
- **`PaymentCollectionSchema`** — `{ captures? }`, scoped to captures (this
  connect doesn't implement `authorizeOrder`, so `authorizations`/`refunds`
  aren't modeled here).
- **`PurchaseUnitSchema`** — one purchase unit of an order response.
- **`OrderSchema`/`OrderSchemaObject`** — the response shape for
  `createOrder`/`getOrder`/`captureOrder`: `{ id, status, intent?, purchase_units, links, ... }`.
  `status` is one of `'CREATED'`/`'SAVED'`/`'APPROVED'`/`'VOIDED'`/
  `'COMPLETED'`/`'PAYER_ACTION_REQUIRED'` (confirmed against PayPal's spec).

## `Refund.ts`

- **`RefundRequestSchema`/`RefundRequestSchemaObject`** —
  `refundCapture`'s request body: `{ amount?, note_to_payer? }`. Omitting
  `amount` requests a full refund.
- **`RefundSchema`/`RefundSchemaObject`** — the response:
  `{ id, status, amount?, note_to_payer?, links? }`. `status` is one of
  `'CANCELLED'`/`'FAILED'`/`'PENDING'`/`'COMPLETED'`.

## `Error.ts`

- **`ErrorDetailSchema`** — one entry of the vendor error envelope's
  `details` array: `{ field?, value?, location?, issue, description? }`.
- **`ErrorEnvelopeSchema`/`ErrorEnvelopeSchemaObject`** — PayPal's
  documented error response body: `{ name, message, debug_id, details?, links? }`,
  returned on every 4xx/5xx response. Used internally by
  `PayPal`'s vendor error mapping — see [Errors](PayPal-Errors.md).

Every object schema accepts unmodeled vendor fields on a **response**
(`.passthrough()`) so a field PayPal adds later doesn't break parsing;
**request** schemas do not, so a typo in a request field is caught locally
rather than silently dropped.

---

[← Back to PayPal](../README.md)
