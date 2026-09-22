# Kalshi Errors

`Kalshi` throws `KalshiError` for invalid configuration, local order
pre-flight validation, and vendor responses — see
[errors/Base.ts](../errors/Base.ts) and
[errors/KalshiErrorCodes.ts](../errors/KalshiErrorCodes.ts).

```ts
import { KalshiError, KalshiErrorCodes } from '@tundraconnect/kalshi/errors';

const error = new KalshiError('NOT_FOUND');
console.log(error.message);
console.log(KalshiErrorCodes.NOT_FOUND);
```

## Codes

Kalshi returns a machine-readable error envelope (`{"error": {"code",
"message", "details"?}}`, occasionally just `{"error": "..."}`) — most of
these codes are keyed off the HTTP status, with `detail` carrying the
vendor's `error.message` (or the bare string) when present.

| Code                         | Meaning                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_MISSING_PRIVATE_KEY` | A `/portfolio/*` method was called but `auth`/`auth.accessKey`/`auth.privateKeyPem` was never configured.                                                                                                                                                                                                                                                  |
| `CONFIG_INVALID_PRIVATE_KEY` | `auth.privateKeyPem` isn't a structurally valid PKCS#8 PEM (missing BEGIN/END markers or invalid base64). A structurally-valid-but-not-actually-RSA key instead fails later, on the first authenticated call — see the API docs' "Configuration" section for why that can't be checked synchronously.                                                      |
| `ORDER_REJECTED`             | `submitOrder()`/`amendOrder()`: a locally-refused (`price`/`count` out of range) or venue-rejected order. `submitOrders()`: a locally-refused order (checked before any request is sent) or a whole-batch rejection — a single row's rejection surfaces as `rejected: true` on that result instead, never a throw. `detail` carries the reason either way. |
| `INVALID_REQUEST`            | A `400`/`422` response outside the order-submission paths above — `detail` carries the vendor's error text.                                                                                                                                                                                                                                                |
| `NOT_FOUND`                  | A `404` response (`getMarket()`/`getEvent()`/`getSeries()` map this to `null` instead of throwing).                                                                                                                                                                                                                                                        |
| `AUTH_FAILED`                | A `401` response — bad/expired credentials, or a signature that doesn't verify (see `KalshiAuth.ts`'s doc comment for the quirks that cause this silently: mismatched timestamp, a query string left in the signed path, seconds instead of milliseconds).                                                                                                 |
| `RATE_LIMITED`               | A `429` response.                                                                                                                                                                                                                                                                                                                                          |
| `RESPONSE_ERROR`             | A success response's body failed schema validation.                                                                                                                                                                                                                                                                                                        |
| `SERVICE_UNAVAILABLE`        | A `5xx` response.                                                                                                                                                                                                                                                                                                                                          |
| `UNKNOWN_ERROR`              | An unmapped status was returned, or an unknown code was supplied.                                                                                                                                                                                                                                                                                          |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof KalshiError && error.code === 'ORDER_REJECTED') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata. This connect never
places `auth.privateKeyPem` or the `KALSHI-ACCESS-SIGNATURE` header value
into an error's context or message — `_isSensitiveHeader` redacts the
signature header the same way every other connect's vendor-specific auth
headers are redacted, so `error.message`/`error.toJSON()` are always safe
to log.

```ts
try {
  await client.submitOrder({
    ticker,
    side: 'BUY',
    price: 0.42,
    count: 3,
    orderType: 'GTC',
  });
} catch (error) {
  if (error instanceof KalshiError) {
    console.log(error.code, error.getContextValue('detail'));
  }
}
```

---

[← Back to Kalshi](../README.md)
