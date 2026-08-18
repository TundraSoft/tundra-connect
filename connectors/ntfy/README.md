# ntfy

Typed, cross-runtime client for [ntfy.sh](https://ntfy.sh), a simple
pub-sub push-notification service.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers & Browser](https://img.shields.io/badge/Cloudflare_Workers_%26_Browser-compatible-orange?logo=cloudflareworkers)

## Overview

ntfy is an open, HTTP-based pub-sub protocol: publish a message to a topic,
and anyone subscribed to that topic gets notified. Topics on the public
`https://ntfy.sh` instance need **no account and no credentials** — pick a
topic name and start publishing. This connect exposes a single method,
`publish()`, covering ntfy's JSON publish form (`POST /`), which is a strict
superset of the plain-text `POST /<topic>` form. It uses RESTler for
transport and Guardian for runtime request/response validation.

```ts
import { Ntfy } from '@tundraconnect/ntfy';

// No account, no API key — just pick a topic and publish.
const client = new Ntfy();
await client.publish({ topic: 'mytopic', message: 'Hello from ntfy!' });
```

## Documentation

| Topic                           | Description                                |
| ------------------------------- | ------------------------------------------ |
| [API](docs/ntfy-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/ntfy-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/ntfy-Schemas.md) | Public Guardian schemas and inferred types |

## Upstream

- [ntfy.sh documentation](https://docs.ntfy.sh/)
- [ntfy.sh publish reference](https://docs.ntfy.sh/publish/)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/ntfy
```

**Bun:**

```sh
bunx jsr add @tundraconnect/ntfy
```

**Node.js:**

```sh
npx jsr add @tundraconnect/ntfy
```

## Quick Start

```ts
import { Ntfy } from '@tundraconnect/ntfy';

const client = new Ntfy();

const message = await client.publish({
  topic: 'mytopic',
  title: 'Disk space alert',
  message: 'Disk usage on server1 is at 90%',
  priority: 4,
  tags: ['warning', 'floppy_disk'],
});

console.log(message.id);
```

Publishing to a protected topic, or against a self-hosted instance, only
needs `auth`/`baseURL` — both plain `RESTlerOptions` fields:

```ts
import { Ntfy } from '@tundraconnect/ntfy';

const client = new Ntfy({
  baseURL: 'https://ntfy.example.com',
  auth: { type: 'BEARER', token: 'tk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
});
```

## Limits

The public `https://ntfy.sh` instance enforces (as documented, subject to
change): a default request-rate limit of 60 requests burst then 1 per 10s
per visitor, a 4,096-byte message body before ntfy auto-converts it to an
attachment, and a 15 MB max attachment size (100 MB total per visitor,
expiring after 3 hours). See the
[ntfy.sh docs](https://docs.ntfy.sh/publish/#limitations) for current
numbers — this connect does not enforce them client-side.

## License

MIT
