# PayPal API

## Configuration

```ts
import { PayPal } from '@tundraconnect/paypal';

const client = new PayPal({
  auth: {
    type: 'CUSTOM',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    environment: 'sandbox',
  },
});
```

Credentials go through the standard `auth` option — `{ type: 'CUSTOM',
clientId, clientSecret, environment }`, all four required:

| `auth` field   | Notes                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------- |
| `clientId`     | REST app Client ID, from the [Developer Dashboard](https://developer.paypal.com/dashboard/). |
| `clientSecret` | REST app Client Secret. Never logged, never placed in a thrown error's context.              |
| `environment`  | `'sandbox'` or `'live'`. Selects the API host — see below.                                   |

An omitted or malformed `auth` throws at construction time — see
[Errors](PayPal-Errors.md)'s `CONFIG_*` codes.

| `environment` | Base URL                           |
| ------------- | ---------------------------------- |
| `'sandbox'`   | `https://api-m.sandbox.paypal.com` |
| `'live'`      | `https://api-m.paypal.com`         |

Unlike a vendor whose test/live modes share one host and differ only by a key
prefix (Stripe, Razorpay), PayPal's sandbox and live environments are
different hosts entirely — `environment` is what selects between them, for
both the token exchange and every API call.

### Authentication — OAuth2 client-credentials

`clientId`/`clientSecret` are never sent directly on an API call. Instead,
this connect exchanges them for a short-lived Bearer access token
(`POST /v1/oauth2/token`, `Authorization: Basic base64(clientId:clientSecret)`,
`grant_type=client_credentials`) the first time it needs one, and reuses that
token — cached in memory — until it's within 60 seconds of PayPal's
documented expiry (typically ~9 hours), at which point the next call
transparently re-exchanges it. This is entirely automatic: no method call is
needed to trigger or refresh it.

Concurrent calls that all find a cold or expired cache share a single
in-flight exchange rather than each independently hitting the token
endpoint — see [Errors](PayPal-Errors.md) for what happens if that exchange
fails (`TOKEN_EXCHANGE_FAILED`).

## Endpoints

| Method                               | Endpoint                                 | Result                             |
| ------------------------------------ | ---------------------------------------- | ---------------------------------- |
| `createOrder(request)`               | `POST /v2/checkout/orders`               | The created order                  |
| `getOrder(orderId)`                  | `GET /v2/checkout/orders/{id}`           | The order's current state          |
| `captureOrder(orderId)`              | `POST /v2/checkout/orders/{id}/capture`  | The order, with captures populated |
| `refundCapture(captureId, request?)` | `POST /v2/payments/captures/{id}/refund` | The refund                         |

```ts
const order = await client.createOrder({
  intent: 'CAPTURE',
  purchase_units: [
    { amount: { currency_code: 'USD', value: '10.00' } },
  ],
});

const current = await client.getOrder(order.id);

const captured = await client.captureOrder(order.id);
const capture = captured.purchase_units[0]?.payments?.captures?.[0];

await client.refundCapture(capture!.id, {
  amount: { currency_code: 'USD', value: '5.00' },
  note_to_payer: 'Partial refund',
});
```

### `createOrder(request)`

- `request.intent` — `'CAPTURE'` or `'AUTHORIZE'` (required). Only
  `'CAPTURE'`-intent orders can be passed to `captureOrder` directly —
  authorizing a payment for later capture (`POST .../authorize`) is a
  separate PayPal endpoint this connect does not implement.
- `request.purchase_units` — 1-10 entries, each requiring
  `amount: { currency_code, value }`. **`value` is a decimal STRING**
  (e.g. `"10.00"`), never a number — see [Schemas](PayPal-Schemas.md).
  Optional per-unit fields: `reference_id`, `items`, `payee`, `custom_id`,
  `invoice_id`, `description`, and `amount.breakdown` (`item_total`,
  `tax_total`, `shipping`, `handling`, `discount`, `insurance`,
  `shipping_discount`).
- `request.application_context` — optional payer-experience customization:
  `brand_name`, `return_url`, `cancel_url`, `user_action`
  (`'CONTINUE'`/`'PAY_NOW'`). PayPal's docs mark this object deprecated in
  favor of `payment_source.paypal.experience_context`, but it remains
  functional and is what this connect models; `payment_source` itself
  (a large payment-method discriminated union — card, PayPal wallet, Venmo,
  BLIK, iDEAL, ...) is out of scope for v1.
- Response: the created order — `id`, `status`
  (`'CREATED'`/`'SAVED'`/`'APPROVED'`/`'VOIDED'`/`'COMPLETED'`/`'PAYER_ACTION_REQUIRED'`),
  `links` (including the `rel: "approve"` link to redirect the payer to),
  `purchase_units`.

### `getOrder(orderId)`

- No body. Returns the same order shape as `createOrder`, reflecting the
  order's current status — poll this (or handle PayPal's return-URL
  redirect) to detect when a payer has approved an order.

### `captureOrder(orderId)`

- Sent with an empty JSON body — PayPal's optional `payment_source` capture
  override is out of v1 scope, for the same reason it's out of scope on
  `createOrder`.
- Response: the order, with `status` typically `'COMPLETED'` and
  `purchase_units[].payments.captures[]` populated — read a capture's `id`
  off there to pass to `refundCapture`.

### `refundCapture(captureId, request?)`

- `request.amount` — optional; omit for a full refund of the capture.
- `request.note_to_payer` — optional reason shown to the payer.
- Response: `{ id, status, amount, ... }` — `status` is one of
  `'CANCELLED'`/`'FAILED'`/`'PENDING'`/`'COMPLETED'`.

## Out of scope (v1)

- **Webhook signature verification** — PayPal's is unusually complex (dual
  local-certificate or API-callback verification) and is not implemented.
  Verify webhooks against PayPal's own guidance until this connect adds it.
- **`payment_source`** — the full payment-method union (cards, wallets,
  BNPL, local payment methods) on order creation/capture.
- **`authorizeOrder`** (`AUTHORIZE`-intent orders' separate capture flow).

See [Errors](PayPal-Errors.md) for failure handling and
[Schemas](PayPal-Schemas.md) for request/response validation.

---

[← Back to PayPal](../README.md)
