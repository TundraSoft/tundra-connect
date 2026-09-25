# CoinGecko Errors

CoinGecko throws `CoinGeckoError` for invalid configuration, documented
vendor responses, and malformed payloads.

```ts
import {
  CoinGeckoError,
  CoinGeckoErrorCodes,
} from '@tundraconnect/coingecko/errors';

const error = new CoinGeckoError('RATE_LIMITED', { status: 429 });
console.log(error.message);
console.log(CoinGeckoErrorCodes.RATE_LIMITED);
```

## Vendor error envelope

CoinGecko's error body shape is inconsistent across endpoints and status
codes. The client normalizes three documented shapes, tried in this order,
before falling back to the raw response body:

1. **Shape B** (structured): `{ "status": { "error_code": number, "error_message": string, "timestamp"?: string } }` — seen on 401/429.
2. **Shape C** (nested): `{ "error": { "status": { "error_code": number, "error_message": string } } }` — seen on some 401s.
3. **Shape A** (flat): `{ "error": "<string>" }` — seen on 400/404/422.

The vendor's numeric `error_code` is only trusted for the four values
CoinGecko documents; every other failure is dispatched on HTTP status.

## Codes

| Code                         | Meaning                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `CONFIG_INVALID_ENVIRONMENT` | `auth.environment` was not `'demo'` or `'pro'`.                                                    |
| `CONFIG_INVALID_API_KEY`     | `auth.apiKey` was set but is not a non-empty string.                                               |
| `CONFIG_MISSING_API_KEY`     | `auth.environment: 'pro'` was set without an `auth.apiKey`.                                        |
| `MISSING_API_KEY`            | Vendor `error_code` 10002 — no API key was supplied.                                               |
| `PLAN_RESTRICTED`            | Vendor `error_code` 10005 — endpoint not available on your plan.                                   |
| `INVALID_KEY_WRONG_HOST`     | Vendor `error_code` 10010/10011 — key sent to the wrong host.                                      |
| `RATE_LIMITED`               | HTTP 429.                                                                                          |
| `INVALID_REQUEST`            | HTTP 400 or 422.                                                                                   |
| `NOT_FOUND`                  | HTTP 404.                                                                                          |
| `RESPONSE_ERROR`             | A successful (< 400) response body failed schema validation.                                       |
| `SERVICE_UNAVAILABLE`        | HTTP 5xx, or no response was received at all (request failed before a status came back).           |
| `UNKNOWN_ERROR`              | An unmapped status >= 400 with no matching status/error_code rule, or an invalid constructor code. |

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof CoinGeckoError && error.code === 'RATE_LIMITED') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, `body`, `vendorMessage`, or `vendorErrorCode`.

```ts
import { CoinGecko, CoinGeckoError } from '@tundraconnect/coingecko';

const client = new CoinGecko({
  auth: { type: 'CUSTOM', environment: 'pro', apiKey: 'bad-key' },
});

try {
  await client.getPrice({ ids: 'bitcoin' });
} catch (error) {
  if (error instanceof CoinGeckoError) {
    console.log(error.getContextValue('status'));
    console.log(error.getContextValue('vendorErrorCode'));
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

[← Back to CoinGecko](../README.md)
