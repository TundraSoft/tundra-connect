# Stripe API

## Configuration

```ts
import { Stripe } from '@tundraconnect/stripe';

const client = new Stripe({
  auth: { type: 'BASIC', username: 'sk_test_...', password: '' },
});
```

`auth` is required and must be `{ type: 'BASIC', username, password: '' }`,
where `username` is the secret or restricted API key and must start with
`sk_` or `rk_` (publishable keys, `pk_...`, are rejected). An incomplete or
malformed configuration throws immediately at construction (see
[Errors](Stripe-Errors.md)).

The base URL is fixed at `https://api.stripe.com/v1` — Stripe has no
separate sandbox host; test-mode keys (`sk_test_...`) hit the identical URL
and are distinguished only by the key itself.

### Authentication

Stripe's primary documented scheme is HTTP Basic Auth: the secret key as
the username, with no password — see
[Stripe's authentication docs](https://docs.stripe.com/api/authentication).
(`Authorization: Bearer <key>` is documented too, but only as an
alternative for cross-origin requests.) This connect models the credential
as the standard `auth: RESTlerAuth` option and sends it as a `BASIC`
credential with an empty password, matching Stripe's primary form exactly.

## Endpoints

| Method                        | Endpoint                    | Result                      |
| ----------------------------- | --------------------------- | --------------------------- |
| `createPaymentIntent(params)` | `POST /payment_intents`     | The created PaymentIntent   |
| `retrievePaymentIntent(id)`   | `GET /payment_intents/{id}` | The requested PaymentIntent |
| `createCustomer(params)`      | `POST /customers`           | The created Customer        |

```ts
import { Stripe } from '@tundraconnect/stripe';

const client = new Stripe({
  auth: { type: 'BASIC', username: 'sk_test_...', password: '' },
});

const intent = await client.createPaymentIntent({
  amount: 1999,
  currency: 'usd',
  automatic_payment_methods: { enabled: true },
});
console.log(intent.id, intent.client_secret);

const retrieved = await client.retrievePaymentIntent(intent.id);
console.log(retrieved.status);

const customer = await client.createCustomer({
  email: 'jenny@example.com',
  name: 'Jenny Rosen',
});
console.log(customer.id);
```

`createPaymentIntent()` requires `amount` and `currency`; every other
option is optional. `createCustomer()` has no universally-required option.
Both requests are validated locally before anything is sent — see
[Schemas](Stripe-Schemas.md) for the full option lists.

### Request encoding

Every write endpoint sends `application/x-www-form-urlencoded`, using
Stripe's bracket notation for nested objects and arrays:
`metadata[orderId]=42`, `payment_method_types[0]=card`. This is handled
internally — callers just pass plain nested objects/arrays.

See [Errors](Stripe-Errors.md) for failure handling and
[Schemas](Stripe-Schemas.md) for request/response validation.

---

[← Back to Stripe](../README.md)

## Webhooks

### `verifyWebhook(options)`

Verifies an inbound webhook from Stripe — a method on the client, not an HTTP call.

**Scheme** (`Stripe-Signature`): `t=<ts>,v1=<hex>[,v1=…]`; HMAC-SHA256 over `<ts>.<rawBody>` with the `whsec_…` secret used **as-is** (UTF-8, not decoded); hex. Every `v1` is checked (a rolling secret yields two); non-`v1` schemes are ignored to prevent downgrade. Five-minute replay window, both directions.

| Option             | Type                | Required | Description                                         |
| ------------------ | ------------------- | -------- | --------------------------------------------------- |
| `payload`          | `string`            | yes      | Raw body — `await req.text()`, never re-serialized. |
| `headers`          | `Headers \| object` | yes      | Case-insensitive lookup.                            |
| `secret`           | `string`            | yes      | The endpoint's `whsec_…` signing secret.            |
| `toleranceSeconds` | `number`            | no       | Replay window. Default `300`.                       |
| `nowMs`            | `number`            | no       | Clock override for tests.                           |

**Returns:** The parsed event (`unknown`).

**Throws:** `StripeError` with `WEBHOOK_INVALID_HEADERS`, `WEBHOOK_TIMESTAMP_INVALID`, `WEBHOOK_SIGNATURE_INVALID`, `RESPONSE_ERROR`.

```ts
const raw = await req.text(); // text(), never json()
const event = await client.verifyWebhook({
  payload: raw,
  headers: req.headers,
  secret: STRIPE_WEBHOOK_SECRET,
});
```

Comparison is constant-time via `@tundralibs/crypt`. Treat `WEBHOOK_SIGNATURE_INVALID` as a forged request.

## Idempotency

`createPaymentIntent` and `createCustomer` accept a trailing `IdempotentRequestOptions`:

```ts
const key = Stripe.newIdempotencyKey(); // a ULID from @tundralibs/id
await db.orders.update(id, { idempotencyKey: key }); // persist FIRST
await client.createPaymentIntent(params, { idempotencyKey: key });
```

Sent as `Idempotency-Key` (≤ 255 chars). Supply the **same** key on every retry of one logical operation and Stripe returns the original result instead of acting again — the defence against a double charge when a request times out after the vendor already acted. Deliberately opt-in: a fresh key per call would be indistinguishable from none, and a fresh key per _retry_ would defeat the point.
