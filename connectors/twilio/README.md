# Twilio

Typed [Twilio REST API](https://www.twilio.com/docs/usage/api) client for Deno,
Bun, Node.js and Cloudflare Workers. Send SMS and MMS through the Messages
resource; place, list, update and delete voice calls through the Calls resource;
and verify webhook signatures. A lightweight alternative to the official
`twilio` Node.js SDK for the endpoints it covers.

[![JSR](https://jsr.io/badges/@tundraconnect/twilio)](https://jsr.io/@tundraconnect/twilio)
[![JSR Score](https://jsr.io/badges/@tundraconnect/twilio/score)](https://jsr.io/@tundraconnect/twilio)

## Overview

Twilio provides validated `sendMessage()` and `createCall()`/`getCall()`/
`listCalls()`/`updateCall()`/`deleteCall()` calls over the Messages and
Calls resources, mapping a camelCase options object to Twilio's
form-encoded PascalCase fields and validating the JSON response. It uses
RESTler for transport (HTTP Basic Auth, built in) and Guardian for runtime
request/response validation. The Calls resource covers placing and
managing calls only — not TwiML/IVR generation (the markup that tells
Twilio what a call should say/do), which is out of scope for this connect.

## Documentation

| Topic                                                                       | Description                                |
| --------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/Twilio-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/Twilio-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/Twilio-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [Twilio REST API reference](https://www.twilio.com/docs/usage/api)
- [Twilio Programmable Messaging API reference](https://www.twilio.com/docs/messaging/api/message-resource)
- [Create a Twilio account](https://www.twilio.com/try-twilio)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/twilio
```

**Bun:**

```sh
bunx jsr add @tundraconnect/twilio
```

**Node.js:**

```sh
npx jsr add @tundraconnect/twilio
```

## Quick Start

```ts
import { Twilio } from '@tundraconnect/twilio';

const client = new Twilio({
  accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  authToken: 'your-auth-token',
});

const message = await client.sendMessage({
  to: '+14155552671',
  from: '+15017122661',
  body: 'Hello from Twilio!',
});

console.log(message.sid, message.status);

const call = await client.createCall({
  to: '+14155552671',
  from: '+15017122661',
  url: 'http://demo.twilio.com/docs/voice.xml',
});

console.log(call.sid, call.status);
```

## Webhooks

```ts
import { Twilio } from '@tundraconnect/twilio';

const client = new Twilio({
  accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  authToken: 'your-auth-token',
});

export async function onWebhook(req: Request): Promise<void> {
  const raw = await req.text(); // text(), never json()
  const type = req.headers.get('content-type') ?? '';
  if (type.startsWith('application/x-www-form-urlencoded')) {
    // Form-encoded (most webhooks): verify the parsed parameters.
    const params = Object.fromEntries(new URLSearchParams(raw));
    await client.verifyWebhook({ url: req.url, headers: req.headers, params });
  } else {
    // JSON: verify the raw body.
    await client.verifyWebhook({
      url: req.url,
      headers: req.headers,
      payload: raw,
    });
  }
}
```

See [API → Webhooks](https://github.com/TundraSoft/tundra-connect/wiki/Twilio-API#webhooks).

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
