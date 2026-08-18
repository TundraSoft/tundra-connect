# Slack

Typed, cross-runtime client for the [Slack Web API](https://docs.slack.dev/apis/web-api).

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers & Browser](https://img.shields.io/badge/Cloudflare_Workers_%26_Browser-compatible-orange?logo=cloudflareworkers)

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
[Errors](docs/Slack-Errors.md) for the full mapping.

```ts
import { Slack } from '@tundraconnect/slack';

const client = new Slack({
  auth: { type: 'BEARER', token: 'xoxb-your-bot-token' },
});
```

## Documentation

| Topic                            | Description                                |
| -------------------------------- | ------------------------------------------ |
| [API](docs/Slack-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/Slack-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/Slack-Schemas.md) | Public Guardian schemas and inferred types |

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

## License

MIT
