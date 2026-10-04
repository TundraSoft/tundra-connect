# Slack

Typed [Slack Web API](https://docs.slack.dev/apis/web-api) client for Deno, Bun,
Node.js and Cloudflare Workers. Post, update and delete messages, list channels
and read history, look up users, and verify request signatures. A lightweight
alternative to `@slack/web-api` for the methods it covers.

[![JSR](https://jsr.io/badges/@tundraconnect/slack)](https://jsr.io/@tundraconnect/slack)
[![JSR Score](https://jsr.io/badges/@tundraconnect/slack/score)](https://jsr.io/@tundraconnect/slack)

## Overview

Slack's Web API is a large collection of `POST`/`GET` methods, all under
`https://slack.com/api`, authenticated with a bot token as a standard
Bearer header. This connect covers the core surface for a bot that posts
notifications and reads back what it (or others) posted: sending, updating,
and deleting a channel message; listing conversations; paging through a
conversation's history; and looking up a user. It uses RESTler for
transport and Guardian for runtime request/response validation.

Slack's defining API quirk — most documented failures arrive as
`HTTP 200 OK` with `{ ok: false, error: '<string>' }` in the body, not a
4xx/5xx status — is handled centrally; see
[Errors](https://github.com/TundraSoft/tundra-connect/wiki/Slack-Errors) for the full mapping.

```ts
import { Slack } from '@tundraconnect/slack';

const client = new Slack({
  auth: { type: 'BEARER', token: 'xoxb-your-bot-token' },
});
```

## Testing your code

Your tests don't need to fake HTTP. Have your code take a `Slack` instance and
pass in a stand-in that returns the shapes from `@tundraconnect/slack/schemas`
or throws a real `SlackError`:

```ts
import { SlackError } from '@tundraconnect/slack/errors';

const outage = new SlackError('SERVICE_UNAVAILABLE', { status: 503 });
console.log(outage.code);
```

To exercise the client itself against a fake transport, subclass it and
reassign the protected `_fetch`.

## Documentation

| Topic                                                                      | Description                                |
| -------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/Slack-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/Slack-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/Slack-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [Slack Web API reference](https://docs.slack.dev/apis/web-api)
- [Create a Slack app](https://api.slack.com/apps) (install it to a
  workspace and grab the bot token from **OAuth & Permissions**)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/slack
```

**Bun:**

```sh
bunx jsr add @tundraconnect/slack
```

**Node.js:**

```sh
npx jsr add @tundraconnect/slack
```

## Quick Start

```ts
import { Slack } from '@tundraconnect/slack';

const client = new Slack({
  auth: { type: 'BEARER', token: 'xoxb-your-bot-token' },
});

const sent = await client.postMessage({
  channel: 'C123ABC456',
  text: 'Deploy succeeded',
});
console.log(sent.ts);
```

## Webhooks

```ts
import { Slack } from '@tundraconnect/slack';

const client = new Slack({
  auth: { type: 'BEARER', token: 'xoxb-your-bot-token' },
});

export async function onSlackRequest(req: Request): Promise<void> {
  const raw = await req.text(); // text(), never json()
  const body = await client.verifyWebhook({
    payload: raw,
    headers: req.headers,
    signingSecret: 'your-signing-secret',
  });
  // `body` is now trustworthy.
}
```

See [API → Webhooks](https://github.com/TundraSoft/tundra-connect/wiki/Slack-API#webhooks).

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
