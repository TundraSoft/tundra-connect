# CloudflareTurnstile API

Client configuration and the verify method of
`@tundraconnect/cloudflare-turnstile`.

## Configuration

```ts
import { CloudflareTurnstile } from '@tundraconnect/cloudflare-turnstile';

const turnstile = new CloudflareTurnstile({
  auth: { type: 'CUSTOM', secretKey: 'YOUR_SECRET_KEY' },
  timeout: 5,
});
```

| Option    | Type                      | Required | Default                                          | Description                                                     |
| --------- | ------------------------- | -------- | ------------------------------------------------ | --------------------------------------------------------------- |
| `auth`    | `CloudflareTurnstileAuth` | yes      | —                                                | `{ type: 'CUSTOM', secretKey }`, the widget's secret key.       |
| `timeout` | `number`                  | no       | `10`                                             | Default per-call deadline in seconds, 1–120, fractions allowed. |
| `baseURL` | `string`                  | no       | `https://challenges.cloudflare.com/turnstile/v0` | Override for a proxy or a test double.                          |

`auth` missing, not `CUSTOM`, or with a blank `secretKey` &rarr;
`CONFIG_INVALID_SECRET_KEY` at construction. The secret is sent in the
request body, never a header or the URL. RESTler drops request bodies from
its `call` events and error contexts, so the secret never appears in either.

### Getters

| Getter   | Type     | Description                     |
| -------- | -------- | ------------------------------- |
| `vendor` | `string` | Always `'CloudflareTurnstile'`. |

### Constants

| Export                    | Value                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `TURNSTILE_API`           | `https://challenges.cloudflare.com/turnstile/v0`                                           |
| `TURNSTILE_DUMMY_SECRETS` | `{ alwaysPasses, alwaysFails, alreadySpent }` — Cloudflare's documented dummy secret keys. |
| `TURNSTILE_DUMMY_TOKEN`   | `XXXX.DUMMY.TOKEN.XXXX` — the token dummy sitekeys hand the browser.                       |

## `verify(options)`

`POST /siteverify` with a JSON body &rarr; `VerificationSchema`.

| Field              | Type                          | Required | Description                                                                          |
| ------------------ | ----------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `response`         | `string`                      | yes      | The widget token, at most 2048 characters.                                           |
| `remoteip`         | `string`                      | no       | The visitor's IP, when you have it.                                                  |
| `idempotency_key`  | `string`                      | no       | A UUID that makes re-verifying the same token return the original verdict.           |
| `expectedHostname` | `string \| readonly string[]` | no       | Hostname(s) the widget is served on; compared case-insensitively with the verdict's. |
| `expectedAction`   | `string`                      | no       | The widget's `data-action`; compared exactly with the verdict's.                     |
| `timeout`          | `number`                      | no       | Deadline for this one call, 1–120 seconds.                                           |

`response`, `remoteip` and `idempotency_key` are Cloudflare's own names, so
a body copied from the siteverify docs works unchanged. The secret is added
from `auth`.

### What resolves and what throws

Turnstile answers almost everything with an HTTP 200 and puts the outcome
in the body's `error-codes`. The connect splits those into two kinds:

| `error-codes`                                    | Outcome                                        |
| ------------------------------------------------ | ---------------------------------------------- |
| none (`success: true`)                           | resolves, after the expectation checks below   |
| `invalid-input-response`, `timeout-or-duplicate` | resolves as `success: false` — about the token |
| `missing-input-secret`, `invalid-input-secret`   | throws `AUTH_FAILED`                           |
| `bad-request`, `missing-input-response`          | throws `INVALID_REQUEST`                       |
| `internal-error`                                 | throws `SERVICE_UNAVAILABLE` (`transient`)     |

When a response carries several codes, the secret ones take precedence,
then the request ones, then `internal-error`. An HTTP error status is
classified by status (401/403 &rarr; `AUTH_FAILED`, 429 &rarr;
`RATE_LIMITED`, 5xx &rarr; `SERVICE_UNAVAILABLE`, other 4xx &rarr;
`INVALID_REQUEST`).

### Expectations

Cloudflare recommends checking `hostname` and `action` on every verdict —
a token is only proof that _some_ widget was solved. When `expectedHostname`
or `expectedAction` is set and Cloudflare said `success: true`:

- a verdict whose `hostname` is not in the expected list (or is absent) is
  returned with `success: false` and `hostname-mismatch` appended to
  `error-codes`;
- a verdict whose `action` differs is returned with `success: false` and
  `action-mismatch` appended.

`hostname-mismatch` and `action-mismatch` are added by this connect;
Cloudflare never emits them. A verdict Cloudflare already failed is returned
as-is. The rest of the verdict (`challenge_ts`, `hostname`, `action`,
`cdata`, `metadata`) is kept for diagnostics either way.

```ts
import { CloudflareTurnstile } from '@tundraconnect/cloudflare-turnstile';

declare const turnstile: CloudflareTurnstile;
declare const token: string;

const verdict = await turnstile.verify({
  response: token,
  expectedHostname: ['example.com', 'www.example.com'],
  expectedAction: 'login',
});
if (!verdict.success) {
  console.log(verdict['error-codes']); // e.g. ['hostname-mismatch']
}
```

### Idempotency

A token is single-use: a second verification answers
`timeout-or-duplicate`. Send the same `idempotency_key` with every attempt
of one verification to make retries safe.

## Not wrapped

The widget management API (`/accounts/{account_id}/challenges/widgets` —
list, create, rotate secret, …) is a Cloudflare account API authenticated
with an API token and wrapped in the `client/v4` envelope. It is a different
credential and a different envelope from siteverify, and is left out.

## Custom transport

Subclass and reassign the protected `_fetch`:

```ts
import {
  CloudflareTurnstile,
  type CloudflareTurnstileOptions,
} from '@tundraconnect/cloudflare-turnstile';

class RoutedTurnstile extends CloudflareTurnstile {
  constructor(options: CloudflareTurnstileOptions, transport: typeof fetch) {
    super(options);
    this._fetch = transport;
  }
}
```

---

[← Back to CloudflareTurnstile](../README.md)
