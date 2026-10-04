# GoogleAnalytics

Typed Google Analytics 4 Measurement Protocol client for Deno, Bun, Node.js
and Cloudflare Workers: send server-side events to a GA4 property and
validate payloads against Google's debug endpoint, with GA4's event,
parameter and user-property limits and reserved names checked before
anything is sent.

[![JSR](https://jsr.io/badges/@tundraconnect/google-analytics)](https://jsr.io/@tundraconnect/google-analytics)
[![JSR Score](https://jsr.io/badges/@tundraconnect/google-analytics/score)](https://jsr.io/@tundraconnect/google-analytics)

## Overview

The Measurement Protocol sends events to GA4 from a server: a click
counted in a redirect handler, a purchase confirmed by a webhook, a
sign-up finished in a background job. It answers `2xx` for anything it
received, even a payload it will silently drop. This connect closes that
gap two ways:

- **Local checks before sending.** Event names (format, 40-character
  limit, reserved names such as `session_start`), up to 25 events per
  request and 25 parameters per event, parameter names and string values
  (100 characters, 500 on GA360), user properties (25, 24-character names,
  36-character values, reserved names), the reserved `_` / `firebase_` /
  `ga_` / `google_` prefixes, the id the stream type needs (`client_id` or
  `app_instance_id`), and the 130 kB body limit. Every violation is
  reported at once in one `REQUEST_VALIDATION_ERROR`.
- **`validate()`**, which sends the payload to `/debug/mp/collect` and
  returns Google's own `validationMessages` as data. Nothing is recorded.

Timeouts, network failures, 5xx and 429 throw `TIMEOUT`, `NETWORK_ERROR`,
`SERVICE_UNAVAILABLE` and `RATE_LIMITED`, all flagged `transient: true`.
The API secret travels as the `api_secret` query parameter, which RESTler
redacts from every event payload and error.

```ts
import { GoogleAnalytics } from '@tundraconnect/google-analytics';
import { GoogleAnalyticsError } from '@tundraconnect/google-analytics/errors';

const ga = new GoogleAnalytics({
  auth: { type: 'CUSTOM', apiSecret: 'YOUR_API_SECRET' },
  measurementId: 'G-XXXXXXXXXX',
  region: 'eu', // optional: collect through region1.google-analytics.com
});

const payload = {
  client_id: '123456789.1700000000', // the visitor's _ga cookie id
  events: [{
    name: 'link_click',
    params: { link_id: 'abc', session_id: 1700000000, engagement_time_msec: 1 },
  }],
};

// While developing, or behind a "Send test" button:
const check = await ga.validate(payload);
for (const m of check.validationMessages) {
  console.log(m.validationCode, m.fieldPath, m.description);
}

try {
  await ga.send(payload);
} catch (err) {
  if (
    err instanceof GoogleAnalyticsError && err.code === 'SERVICE_UNAVAILABLE'
  ) {
    // queue the event and send it again later
  } else {
    throw err;
  }
}
```

## Endpoints

| Method              | Request                                                |
| ------------------- | ------------------------------------------------------ |
| `send(payload)`     | `POST /mp/collect?api_secret=…&measurement_id=…`       |
| `validate(payload)` | `POST /debug/mp/collect?api_secret=…&measurement_id=…` |

An app stream uses `firebase_app_id` in place of `measurement_id`. The GA4
Data API (reports) and Admin API are separate products and are not wrapped.

## Credentials

- **Measurement id** (`G-XXXXXXXXXX`): Admin > Data Streams > your web
  stream. For an app stream, use its **Firebase app id** instead.
- **API secret:** the same stream > Measurement Protocol API secrets >
  Create.

The debug endpoint does not check the API secret, so a valid `validate()`
result does not prove the secret is right. Look for the test event in GA4's
Realtime or DebugView report once to confirm the setup end to end.

## Testing your code

Your tests don't need to fake HTTP. Have your code take a `GoogleAnalytics`
instance and pass in a stand-in that resolves or throws a real
`GoogleAnalyticsError`:

```ts
import { GoogleAnalyticsError } from '@tundraconnect/google-analytics/errors';

const outage = new GoogleAnalyticsError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(outage.code);
```

To exercise the client itself against a fake transport, subclass it and
reassign the protected `_fetch`.

## Documentation

| Topic                                                                                | Description                                        |
| ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/GoogleAnalytics-API)         | Client configuration, `send` and `validate`        |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/GoogleAnalytics-Errors)   | Error codes and diagnostic metadata                |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/GoogleAnalytics-Schemas) | Public Guardian schemas, limits and reserved names |

## Upstream

- [Measurement Protocol (GA4)](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
- [Reference](https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference)
- [Validating events](https://developers.google.com/analytics/devguides/collection/protocol/ga4/validating-events)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/google-analytics
```

**Bun:**

```sh
bunx jsr add @tundraconnect/google-analytics
```

**Node.js:**

```sh
npx jsr add @tundraconnect/google-analytics
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
