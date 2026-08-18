# Sentry

Typed, cross-runtime client for [Sentry's organization/project REST API](https://docs.sentry.io/api/) (`https://sentry.io/api/0/`).

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

Sentry is an error-tracking and performance-monitoring platform. This
connect covers reading and triaging issues (list/get/update, plus an
issue's raw events), listing projects, and publishing releases against
Sentry's organization-scoped REST API. It uses RESTler for transport and
Guardian for runtime request/response validation.

It does **not** implement the separate DSN-based event-ingestion protocol
(the semi-binary envelope format an SDK uses to _report_ a new
error/exception into Sentry) — that's architecturally foreign to this
connect's request/response client pattern and out of scope here.

```ts
import { Sentry } from '@tundraconnect/sentry';

const client = new Sentry({
  auth: { type: 'BEARER', token: 'sntrys_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
  organization: 'my-org',
});
```

## Documentation

| Topic                             | Description                                |
| --------------------------------- | ------------------------------------------ |
| [API](docs/Sentry-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/Sentry-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/Sentry-Schemas.md) | Public Guardian schemas and inferred types |

## Upstream

- [Sentry API reference](https://docs.sentry.io/api/)
- [Create a Sentry account](https://sentry.io/signup/)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/sentry
```

**Bun:**

```sh
bunx jsr add @tundraconnect/sentry
```

**Node.js:**

```sh
npx jsr add @tundraconnect/sentry
```

## Quick Start

```ts
import { Sentry } from '@tundraconnect/sentry';

const client = new Sentry({
  auth: { type: 'BEARER', token: 'sntrys_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
  organization: 'my-org',
});

const { issues } = await client.listIssues({ query: 'is:unresolved' });
for (const issue of issues) {
  console.log(issue.shortId, issue.title, issue.level);
}
```

## License

MIT
