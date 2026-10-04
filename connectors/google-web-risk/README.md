# Google Web Risk

Typed Google Web Risk client for Deno, Bun, Node.js and Cloudflare Workers:
check a URL against Google's malware, social-engineering (phishing) and
unwanted-software lists with the Lookup API's `uris:search`, under a hard
per-call deadline, without pulling in the `@google-cloud/web-risk` SDK.

[![JSR](https://jsr.io/badges/@tundraconnect/google-web-risk)](https://jsr.io/@tundraconnect/google-web-risk)
[![JSR Score](https://jsr.io/badges/@tundraconnect/google-web-risk/score)](https://jsr.io/@tundraconnect/google-web-risk)

## Overview

Web Risk is the commercial counterpart of Google Safe Browsing. This connect
wraps exactly one call, the Lookup API's
`GET /v1/uris:search?uri=…&threatTypes=…`, and turns its answer into a typed
verdict:

- `{ listed: false }`: Web Risk checked the URI and it is on none of the
  requested lists.
- `{ listed: true, threatTypes, expiresOn }`: the lists it is on, and when
  that verdict should be refreshed (`expireTime`, parsed to a `Date`).

Anything that prevents an answer throws a `GoogleWebRiskError`; it never
comes back as `listed: false`. That covers a timeout, a network failure, a
5xx, a quota error or a malformed body. The four "no verdict yet" codes are
flagged `transient: true`.

The API key travels in the `X-Goog-Api-Key` header, never in the URL, and is
redacted from every RESTler event payload and error context.

```ts
import { GoogleWebRisk } from '@tundraconnect/google-web-risk';
import { GoogleWebRiskError } from '@tundraconnect/google-web-risk/errors';

const webRisk = new GoogleWebRisk({
  auth: { type: 'CUSTOM', apiKey: 'YOUR_API_KEY' },
  timeout: 1.5, // seconds, whole call; fractional is fine (min 1)
});

try {
  const verdict = await webRisk.search({ uri: 'https://example.com/' });
  if (verdict.listed) {
    console.log('blocked:', verdict.threatTypes, 'until', verdict.expiresOn);
  }
} catch (err) {
  if (err instanceof GoogleWebRiskError && err.transient) {
    // TIMEOUT / NETWORK_ERROR / SERVICE_UNAVAILABLE / RATE_LIMITED: retry later
  } else {
    throw err;
  }
}
```

## Pricing and limits

Read this before adding any other Web Risk call to this connect. Prices are
from [Google's pricing page](https://cloud.google.com/web-risk/pricing).

| Call                                   | Free tier             | Then               |
| -------------------------------------- | --------------------- | ------------------ |
| `uris:search` (this connect)           | 100,000 calls / month | $0.50 / 1,000      |
| `hashes.search` (Update API)           | none                  | **$50.00 / 1,000** |
| `threatLists.computeDiff` (Update API) | unlimited             | free               |

- **`hashes.search` is deliberately not wrapped.** At $50 per 1,000 it costs
  100× `uris:search`, and it is billed from the first call.
- **Calling `threatLists.computeDiff` reprices `uris:search`.** Google bills
  every `uris:search` call on an account that uses the Update API at the
  $50 / 1,000 `hashes.search` rate. Adding the "free" diff call would raise
  the price of the lookups this connect makes by 100×.
- Web Risk requires billing to be enabled on the Google Cloud project, even
  for usage inside the free tier.
- One URI per call. To check several, make one call each.

## The deadline

`timeout` (on the client, or per call on `search`) is a **total** deadline
in seconds: it bounds the whole call, body read included, and accepts
fractions down to 1 (`1.5`). Missing it throws `TIMEOUT`.

It stays a total deadline as long as you leave RESTler's `maxRetryWait`
unset, which is the default. With `maxRetryWait` set, a 429 is retried once
after the vendor's hint, and that wait sits _outside_ `timeout`.

## Custom transport

To route requests through your own transport (a test double, a tracing
wrapper, a Worker's `fetch` binding), subclass the client and reassign the
protected `_fetch`:

```ts
import {
  GoogleWebRisk,
  type GoogleWebRiskOptions,
} from '@tundraconnect/google-web-risk';

class RoutedWebRisk extends GoogleWebRisk {
  constructor(options: GoogleWebRiskOptions, transport: typeof fetch) {
    super(options);
    this._fetch = transport;
  }
}
```

## Testing your code

Your tests don't need to fake HTTP. Have your code take a `GoogleWebRisk`
instance and pass in a stand-in that returns the shapes from
`@tundraconnect/google-web-risk/schemas` or throws a real `GoogleWebRiskError`:

```ts
import { GoogleWebRiskError } from '@tundraconnect/google-web-risk/errors';

const outage = new GoogleWebRiskError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(outage.code, outage.transient);
```

To exercise the client itself against a fake transport, subclass it and
reassign the protected `_fetch` (see Custom transport above).

## Documentation

| Topic                                                                              | Description                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/GoogleWebRisk-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/GoogleWebRisk-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/GoogleWebRisk-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [Lookup API guide](https://cloud.google.com/web-risk/docs/lookup-api)
- [`uris.search` reference](https://cloud.google.com/web-risk/docs/reference/rest/v1/uris/search)
- [Web Risk pricing](https://cloud.google.com/web-risk/pricing)
- [Set up Web Risk](https://cloud.google.com/web-risk/docs/quickstart)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/google-web-risk
```

**Bun:**

```sh
bunx jsr add @tundraconnect/google-web-risk
```

**Node.js:**

```sh
npx jsr add @tundraconnect/google-web-risk
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
