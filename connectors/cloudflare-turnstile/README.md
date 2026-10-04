# CloudflareTurnstile

Typed Cloudflare Turnstile client for Deno, Bun, Node.js and Cloudflare
Workers: verify a widget token server-side with the siteverify endpoint,
check the verdict's hostname and action against what you expect, and bound
every call with a hard deadline. A failed challenge is an answer, not an
error.

[![JSR](https://jsr.io/badges/@tundraconnect/cloudflare-turnstile)](https://jsr.io/@tundraconnect/cloudflare-turnstile)
[![JSR Score](https://jsr.io/badges/@tundraconnect/cloudflare-turnstile/score)](https://jsr.io/@tundraconnect/cloudflare-turnstile)

## Overview

Turnstile is Cloudflare's CAPTCHA replacement. The widget on your page puts
a token in `cf-turnstile-response`; your server must send that token to
`POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with the
widget's secret key before trusting the submission. This connect wraps that
one call:

- `verify` resolves to Cloudflare's verdict. An invalid, expired or
  already-spent token is `success: false` with `error-codes`
  (`invalid-input-response`, `timeout-or-duplicate`), never a thrown error.
- `expectedHostname` / `expectedAction` re-check a verdict Cloudflare
  accepted: a token issued for another site or widget action comes back
  `success: false` with `hostname-mismatch` / `action-mismatch` appended.
- A failure of the **call** throws a `CloudflareTurnstileError` with a
  stable code: a bad secret is `AUTH_FAILED`, a malformed request
  `INVALID_REQUEST`, and `TIMEOUT` / `NETWORK_ERROR` / `SERVICE_UNAVAILABLE`
  / `RATE_LIMITED` are flagged `transient: true`.
- The secret key rides in the request body, which RESTler never copies into
  an event or an error.

```ts
import { CloudflareTurnstile } from '@tundraconnect/cloudflare-turnstile';
import { CloudflareTurnstileError } from '@tundraconnect/cloudflare-turnstile/errors';

const turnstile = new CloudflareTurnstile({
  auth: { type: 'CUSTOM', secretKey: 'YOUR_SECRET_KEY' },
  timeout: 5, // seconds, whole call; fractional is fine (min 1)
});

declare const request: Request; // your form submission

const form = await request.formData();
try {
  const verdict = await turnstile.verify({
    response: String(form.get('cf-turnstile-response') ?? ''),
    remoteip: request.headers.get('CF-Connecting-IP') ?? undefined,
    expectedHostname: 'example.com',
    expectedAction: 'signup',
  });
  if (!verdict.success) {
    // Show the form again; verdict['error-codes'] says why.
  }
} catch (err) {
  if (err instanceof CloudflareTurnstileError && err.transient) {
    // No verdict could be had: decide whether to fail open or ask the
    // visitor to retry.
  } else {
    throw err; // AUTH_FAILED (bad secret), INVALID_REQUEST, RESPONSE_ERROR
  }
}
```

## Endpoint

| Method                                                                                            | Request                                |
| ------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `verify({ response, remoteip?, idempotency_key?, expectedHostname?, expectedAction?, timeout? })` | `POST /turnstile/v0/siteverify` (JSON) |

The Turnstile **widget management** API (`/accounts/{id}/challenges/widgets`)
is not wrapped: it is a Cloudflare account API with its own token and
envelope, separate from the per-widget secret siteverify uses.

## Tokens, retries and idempotency

A token is valid for 300 seconds and can be verified **once**. Verifying it
again answers `timeout-or-duplicate`. If your handler may retry (a flaky
network, an at-least-once queue), send the same `idempotency_key` (a UUID)
with every attempt for one token, and Cloudflare returns the original
verdict instead.

## Testing without a widget

Cloudflare publishes dummy keys, exported here as `TURNSTILE_DUMMY_SECRETS`
and `TURNSTILE_DUMMY_TOKEN`. Each dummy secret accepts only the dummy token
and behaves as named: `alwaysPasses`, `alwaysFails`
(`invalid-input-response`) and `alreadySpent` (`timeout-or-duplicate`).

```ts
import {
  CloudflareTurnstile,
  TURNSTILE_DUMMY_SECRETS,
  TURNSTILE_DUMMY_TOKEN,
} from '@tundraconnect/cloudflare-turnstile';

const passes = new CloudflareTurnstile({
  auth: { type: 'CUSTOM', secretKey: TURNSTILE_DUMMY_SECRETS.alwaysPasses },
});
const verdict = await passes.verify({ response: TURNSTILE_DUMMY_TOKEN });
console.log(verdict.success); // true
```

## The deadline

`timeout` (on the client, or per call) is a **total** deadline in seconds:
it bounds the whole call, body read included, and accepts fractions down to
1 (`1.5`). Missing it throws `TIMEOUT`. It stays a total deadline as long as
RESTler's `maxRetryWait` is unset (the default).

## Custom transport

To route requests through your own transport (a test double, a tracing
wrapper), subclass the client and reassign the protected `_fetch`:

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

## Testing your code

Your tests don't need to fake HTTP. Have your code take a `CloudflareTurnstile`
instance and pass in a stand-in that returns the shapes from
`@tundraconnect/cloudflare-turnstile/schemas` or throws a real `CloudflareTurnstileError`:

```ts
import { CloudflareTurnstileError } from '@tundraconnect/cloudflare-turnstile/errors';

const outage = new CloudflareTurnstileError('SERVICE_UNAVAILABLE', {
  status: 503,
});
console.log(outage.code);
```

To exercise the client itself against a fake transport, subclass it and
reassign the protected `_fetch` (see Custom transport above).

## Documentation

| Topic                                                                                    | Description                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/CloudflareTurnstile-API)         | Client configuration and the verify method |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/CloudflareTurnstile-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/CloudflareTurnstile-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Testing with dummy keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
- [Turnstile dashboard](https://dash.cloudflare.com/?to=/:account/turnstile)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/cloudflare-turnstile
```

**Bun:**

```sh
bunx jsr add @tundraconnect/cloudflare-turnstile
```

**Node.js:**

```sh
npx jsr add @tundraconnect/cloudflare-turnstile
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
