# Razorpay API

## Configuration

```ts
import { Razorpay } from '@tundraconnect/razorpay';

const client = new Razorpay({
  auth: { type: 'BASIC', username: 'rzp_test_...', password: '...' },
});
```

`auth` is required and must be `{ type: 'BASIC', username, password }`,
where `username` is the `key_id` (must start with `rzp_test_` or
`rzp_live_`) and `password` is the corresponding `key_secret`. An
incomplete or malformed configuration throws immediately at construction
(see [Errors](Razorpay-Errors.md)). The configured `key_id` is readable
back via `client.keyId`; `key_secret` is never exposed through a getter or
echoed into any error.

The base URL is fixed at `https://api.razorpay.com/v1` — Razorpay has no
separate sandbox host; test-mode keys (`rzp_test_...`) hit the identical
URL and are distinguished only by the key itself.

### Authentication

Razorpay's documented scheme
([Authentication](https://razorpay.com/docs/api/authentication/)) is HTTP
Basic Auth: the `key_id` as the username, the `key_secret` as the
password. This connect models the credential as the standard
`auth: RESTlerAuth` option and sends it as a `BASIC` credential exactly as
documented — no `_authInjector` override needed.

### Amounts (paise convention)

Every `amount` field — on every request and every response — is in the
**smallest unit of the currency**: paise for INR, cents for USD, and so
on. It is always a positive integer, never a decimal major-unit amount.
To charge ₹299.00, send `amount: 29900`, not `299` or `299.00`. This is
the single most common Razorpay integration mistake. For the handful of
ISO 4217 currencies with 3 decimal places (e.g. KWD), Razorpay requires
the amount's last digit to be `0`.

## Endpoints

| Method                       | Endpoint                      | Result                                        |
| ---------------------------- | ----------------------------- | --------------------------------------------- |
| `createOrder(params)`        | `POST /orders`                | The created Order                             |
| `getOrder(id)`               | `GET /orders/{id}`            | The requested Order                           |
| `capturePayment(id, params)` | `POST /payments/{id}/capture` | The captured Payment                          |
| `getPayment(id)`             | `GET /payments/{id}`          | The requested Payment                         |
| `createPaymentLink(params)`  | `POST /payment_links`         | The created Payment Link                      |
| `listPayments(params?)`      | `GET /payments`               | A page of Payments (`{entity, count, items}`) |

```ts
import { Razorpay } from '@tundraconnect/razorpay';

const client = new Razorpay({
  auth: { type: 'BASIC', username: 'rzp_test_...', password: '...' },
});

const order = await client.createOrder({
  amount: 29900,
  currency: 'INR',
  receipt: 'receipt#1',
});
console.log(order.id, order.status);

const fetched = await client.getOrder(order.id);
console.log(fetched.amount_due);

const payment = await client.capturePayment('pay_29QQoUBi66xm2f', {
  amount: 29900,
  currency: 'INR',
});
console.log(payment.status, payment.captured);

const fetchedPayment = await client.getPayment(payment.id);
console.log(fetchedPayment.method);

const link = await client.createPaymentLink({
  amount: 29900,
  description: 'Payment for order #1',
  customer: { name: 'Gaurav Kumar', email: 'gaurav.kumar@example.com' },
});
console.log(link.short_url);

const page = await client.listPayments({ count: 20, skip: 0 });
console.log(page.count, page.items.map((p) => p.id));
```

`createOrder()` requires `amount` and `currency`; `capturePayment()`
requires `amount` and `currency` matching the payment's authorized amount
and original currency; `createPaymentLink()` requires only `amount`.
`listPayments()`'s `count`/`skip` are both optional — Razorpay defaults
`count` to `10` server-side when omitted. Every request is validated
locally before anything is sent — see [Schemas](Razorpay-Schemas.md) for
the full option lists.

`createPaymentLink()`'s `callback_method` must be `'get'` when supplied
alongside `callback_url` — the schema models it as the literal `'get'`
rather than a free-form string, so any other value is rejected locally
before the request is ever sent.

See [Errors](Razorpay-Errors.md) for failure handling and
[Schemas](Razorpay-Schemas.md) for request/response validation.

---

[← Back to Razorpay](../README.md)
