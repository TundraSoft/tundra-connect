# Upstash Redis

Typed [Upstash Redis REST API](https://upstash.com/docs/redis/features/restapi)
client for Deno, Bun, Node.js and Cloudflare Workers: Redis over plain HTTPS,
with no TCP client or connection pool. It covers
`GET`/`SET`/`DEL`/`EXISTS`/`EXPIRE`/`INCR`/`INCRBY`, hash (`HGET`/`HSET`) and
list (`LPUSH`/`RPUSH`/`LRANGE`) commands, request-level pipelining, and a
low-level `execute()` escape hatch for anything not otherwise typed. A
lightweight alternative to `@upstash/redis` for the commands it covers.

[![JSR](https://jsr.io/badges/@tundraconnect/upstash-redis)](https://jsr.io/@tundraconnect/upstash-redis)
[![JSR Score](https://jsr.io/badges/@tundraconnect/upstash-redis/score)](https://jsr.io/@tundraconnect/upstash-redis)

## Overview

Upstash exposes every Redis database it hosts over a REST API in addition
to the normal Redis wire protocol: a command is a JSON array
(`["SET", "key", "value"]`) posted to the database's REST URL, and the
response is a small JSON envelope (`{"result": ...}` or `{"error": ...}`).
This connect wraps that API with one typed method per command, Guardian
schemas for every request/response shape, and a single `UpstashRedisError`
class for every failure mode.

```ts
import { UpstashRedis } from '@tundraconnect/upstash-redis';

const client = new UpstashRedis({
  auth: { type: 'BEARER', token: 'AAAAA...', prefix: 'Bearer' },
  baseURL: 'https://us1-merry-cat-32748.upstash.io',
});

await client.set('foo', 'bar', { ex: 60 });
console.log(await client.get('foo')); // 'bar'
```

## Documentation

| Topic                                                                             | Description                                |
| --------------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/UpstashRedis-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/UpstashRedis-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/UpstashRedis-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [Vendor API reference](https://upstash.com/docs/redis/features/restapi)
- [Create a vendor account](https://upstash.com/) — the free tier includes
  10 databases and 500K commands/month, no card required.

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/upstash-redis
```

**Bun:**

```sh
bunx jsr add @tundraconnect/upstash-redis
```

**Node.js:**

```sh
npx jsr add @tundraconnect/upstash-redis
```

## Quick Start

Create a database in the [Upstash console](https://console.upstash.com/),
copy its **REST URL** and **REST token**, then:

```ts
import { UpstashRedis } from '@tundraconnect/upstash-redis';

const client = new UpstashRedis({
  auth: { type: 'BEARER', token: 'AAAAA...', prefix: 'Bearer' },
  baseURL: 'https://us1-merry-cat-32748.upstash.io',
});

// Set a key with a 60-second expiry, then read it back.
await client.set('foo', 'bar', { ex: 60 });
const value = await client.get('foo'); // 'bar'

// Hashes and lists work the same way.
await client.hset('employee:1', { name: 'Ada', salary: 100000 });
await client.rpush('queue', 'job-1', 'job-2');

// Batch several commands in one round trip (not atomic — see the API docs).
const results = await client.pipeline([
  ['INCR', 'visits'],
  ['GET', 'foo'],
]);
```

Every method throws `UpstashRedisError` on failure — see
[Errors](https://github.com/TundraSoft/tundra-connect/wiki/UpstashRedis-Errors) for the full code list and how to
branch on `error.code`.

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
