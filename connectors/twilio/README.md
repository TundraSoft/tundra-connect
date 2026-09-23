# Twilio

Typed, cross-runtime client for the [Twilio REST API](https://www.twilio.com/docs/usage/api), covering SMS/MMS sending via the Messages resource and voice calls via the Calls resource.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers & Browser](https://img.shields.io/badge/Cloudflare_Workers_%26_Browser-compatible-orange?logo=cloudflareworkers)

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

| Topic                             | Description                                |
| --------------------------------- | ------------------------------------------ |
| [API](docs/Twilio-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/Twilio-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/Twilio-Schemas.md) | Public Guardian schemas and inferred types |

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
const raw = await req.text(); // text(), never json()
await client.verifyWebhook({ url: req.url, headers: req.headers, params }); // form
await client.verifyWebhook({
  url: req.url,
  headers: req.headers,
  payload: raw,
}); // JSON
```

See [API → Webhooks](docs/Twilio-API.md#webhooks).

## License

MIT
