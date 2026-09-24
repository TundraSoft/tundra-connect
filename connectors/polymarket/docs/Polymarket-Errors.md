# Polymarket Errors

`Polymarket` throws `PolymarketError` for invalid configuration, missing
credentials, order-submission outcomes, and vendor responses — see
[errors/Base.ts](../errors/Base.ts) and
[errors/PolymarketErrorCodes.ts](../errors/PolymarketErrorCodes.ts).

```ts
import {
  PolymarketError,
  PolymarketErrorCodes,
} from '@tundraconnect/polymarket/errors';

const error = new PolymarketError('NOT_FOUND');
console.log(error.message);
console.log(PolymarketErrorCodes.NOT_FOUND);
```

## Codes

Neither Gamma nor the CLOB documents a machine-readable vendor error code —
both return a plain `{"error": "..."}` (or occasionally a bare string) body,
so most of these are keyed off the HTTP status alone, plus configuration
and credential-state failures that never come from the wire.

| Code                                 | Meaning                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_MISSING_PRIVATE_KEY`         | A CLOB method was called but `auth`/`auth.privateKey` (or `auth.funder`, for order placement) was never configured.                                                                                                                                                                                                                                                                                     |
| `CONFIG_INVALID_PRIVATE_KEY`         | `auth.privateKey` isn't 32 bytes of hex, or isn't a valid secp256k1 scalar.                                                                                                                                                                                                                                                                                                                             |
| `CONFIG_INVALID_FUNDER`              | `auth.funder` isn't a valid `0x`-prefixed 20-byte address.                                                                                                                                                                                                                                                                                                                                              |
| `CONFIG_MISSING_RELAYER_CREDENTIALS` | `split()`/`merge()`/`redeem()` were called but `auth.relayerApiKey`/`auth.relayerApiKeyAddress` — a credential separate from the CLOB's L2 `apiCredentials` — were never configured.                                                                                                                                                                                                                    |
| `NO_API_CREDENTIALS`                 | An L2-authenticated method was called before `deriveApiCredentials()` ran (or credentials were supplied at construction).                                                                                                                                                                                                                                                                               |
| `ORDER_REJECTED`                     | `submitOrder()`: the CLOB rejected the order for a reason other than a graceful FAK/FOK no-match or a version mismatch. `submitOrders()`: the CLOB rejected an entire chunk at once (no per-order outcome to report) rather than one order within it — a single order's rejection surfaces as `rejected: true` on that result instead, never a throw. `detail` carries the vendor's message either way. |
| `ORDER_VERSION_MISMATCH_PERSISTED`   | The CLOB reported `order_version_mismatch` again after `submitOrder()`/`submitOrders()`'s one automatic refresh-and-retry (per chunk, for the bulk path).                                                                                                                                                                                                                                               |
| `INVALID_REQUEST`                    | Gamma/the CLOB/the Relayer returned `400`/`422` — `detail` carries the vendor's error text.                                                                                                                                                                                                                                                                                                             |
| `NOT_FOUND`                          | A `404` response (`getMarketBySlug()` maps this to `null` instead of throwing).                                                                                                                                                                                                                                                                                                                         |
| `AUTH_FAILED`                        | A `401` response — shared by Gamma, the CLOB, and the Relayer (e.g. bad/expired `relayerApiKey`).                                                                                                                                                                                                                                                                                                       |
| `RATE_LIMITED`                       | A `429` response.                                                                                                                                                                                                                                                                                                                                                                                       |
| `RESPONSE_ERROR`                     | A success response's body failed schema validation.                                                                                                                                                                                                                                                                                                                                                     |
| `SERVICE_UNAVAILABLE`                | A `5xx` response.                                                                                                                                                                                                                                                                                                                                                                                       |
| `UNKNOWN_ERROR`                      | An unmapped status was returned, or an unknown code was supplied.                                                                                                                                                                                                                                                                                                                                       |

`submitOrder()`'s error handling is intentionally NOT the generic
status-code mapping above — a `400` there can mean "FAK/FOK found no
liquidity" (reported via `result.noMatch`, never thrown) or "retry with the
other protocol version" (handled automatically), so only a genuine
rejection reaches `ORDER_REJECTED`. See
[API: submitOrder()](Polymarket-API.md#submitorder--build-sign-submit-one-retry).

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (
  error instanceof PolymarketError &&
  error.code === 'ORDER_VERSION_MISMATCH_PERSISTED'
) {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata. This connect never
places `auth.privateKey`, a derived API secret/passphrase, or any
`POLY_SIGNATURE`/`POLY_PASSPHRASE`/`POLY_API_KEY` header value into an
error's context or message — `_isSensitiveHeader` redacts them the same way
every other connect's vendor-specific auth headers are redacted, so
`error.message`/`error.toJSON()` are always safe to log.

```ts
try {
  await client.submitOrder({
    tokenId,
    side: 'BUY',
    price: 0.55,
    shares: 9,
    orderType: 'FAK',
  });
} catch (error) {
  if (error instanceof PolymarketError) {
    console.log(
      error.code,
      error.getContextValue('status'),
      error.getContextValue('detail'),
    );
  }
}
```

## Backing off after a 429

A rate-limited request throws `RATE_LIMITED`. Two context values tell you what to
do next:

| Context             | Meaning                                                                                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retryAfterSeconds` | Seconds the vendor asked you to wait, parsed by RESTler from `Retry-After` (delta seconds or an HTTP-date), `X-RateLimit-Reset-After`, `RateLimit-Reset`, or an epoch-seconds `X-RateLimit-Reset`. `undefined` when the response carried none — never a guess. |
| `retried`           | Set only when `maxRetryWait` is configured: `true` if RESTler already waited once and was throttled again, `false` if it did not wait (the hint exceeded the cap, or there was no hint to wait on).                                                            |

Nothing is retried by default. Opt in with two client options (seconds,
each `0`–`120`):

- **`maxRetryWait`** — when a 429 carries a hint no longer than this,
  RESTler waits that long and retries **once**; otherwise it throws
  `RATE_LIMITED` immediately. `0` disables the retry.
- **`defaultRetryWait`** — the wait used when a 429 carries **no** hint.
  Without it a hintless 429 is never retried: RESTler does not invent a
  delay. Only consulted when `maxRetryWait` is set, and still capped by it.

---

[← Back to Polymarket](../README.md)
