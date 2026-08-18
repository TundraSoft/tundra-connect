# Algolia Errors

`Algolia` throws `AlgoliaError` for local request/config validation and
for every vendor response — see [errors/Base.ts](../errors/Base.ts) and
[errors/AlgoliaErrorCodes.ts](../errors/AlgoliaErrorCodes.ts).

```ts
import { AlgoliaError, AlgoliaErrorCodes } from '@tundraconnect/algolia/errors';

const error = new AlgoliaError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(error.message);
```

## Codes

Algolia's error envelope is a single documented shape —
`{"message":"Invalid Application-ID or API key","status":403}` — with no
separate vendor error code to key off, so every vendor-response code below
is dispatched purely on HTTP status (see `Algolia.ts`'s `__toError`).

| Code                            | Meaning                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `UNKNOWN_ERROR`                 | An unmapped status was returned, or an unknown code was supplied.                     |
| `INVALID_REQUEST`               | HTTP 400/422, **or** a local Guardian validation failure before the request was sent. |
| `RESPONSE_ERROR`                | A success response's body failed schema validation.                                   |
| `SERVICE_UNAVAILABLE`           | HTTP 5xx.                                                                             |
| `AUTH_FAILED`                   | HTTP 401/403 — invalid `applicationId`/`apiKey`, or a key missing the required ACL.   |
| `NOT_FOUND`                     | HTTP 404 — the index, object, or task does not exist.                                 |
| `RATE_LIMITED`                  | HTTP 429 — too many requests for the configured plan/quota.                           |
| `CONFIG_INVALID_AUTH`           | `auth` is missing or not `{ type: 'CUSTOM', ... }`.                                   |
| `CONFIG_INVALID_APPLICATION_ID` | `auth.applicationId` is missing or empty.                                             |
| `CONFIG_INVALID_API_KEY`        | `auth.apiKey` is missing or empty. Never echoes the (invalid) value.                  |
| `TASK_TIMEOUT`                  | `waitTask` exceeded its polling budget without observing `status: 'published'`.       |

`INVALID_REQUEST` is intentionally reused for both a local (pre-request)
validation failure and a vendor 400/422 response — both mean "the request
itself was rejected as invalid," just at different points in the request
lifecycle. The vendor's `message` (when available) is preserved via
`getContextValue('message')`.

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof AlgoliaError && error.code === 'RATE_LIMITED') {
  // back off and retry
}
```

Use `getContextValue()` to read diagnostic metadata — see
[errors/Base.ts](../errors/Base.ts). `context.applicationId` may
legitimately appear in a thrown error (it's not a credential);
`context.apiKey` never does — see the "Credentials" section below.

## Credentials never leak

Algolia sends two credential-shaped headers on every request:
`x-algolia-application-id` (not secret) and `x-algolia-api-key` (secret).
`Algolia` overrides `_isSensitiveHeader` so `x-algolia-api-key` is redacted
as `[REDACTED]` in `call`/`authFailure` event payloads and in any thrown
error's request context — the same class of bug this repo's adversarial
review already found and fixed once in CoinGecko's vendor-specific API-key
header. `x-algolia-application-id` is deliberately **not** redacted: it
isn't a credential, and legitimately shows up in logs, error contexts, and
even the request URL's hostname.

`auth.apiKey` is also never placed in a thrown config error's context —
`CONFIG_INVALID_API_KEY` is thrown with no `apiKey` field at all, not even
the invalid value, so no future refactor can start echoing it unnoticed.

---

[← Back to Algolia](../README.md)
