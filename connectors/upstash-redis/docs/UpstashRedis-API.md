# UpstashRedis API

## Configuration

```ts
import { UpstashRedis } from '@tundraconnect/upstash-redis';

const client = new UpstashRedis({
  auth: { type: 'BEARER', token: 'AAAAA...', prefix: 'Bearer' },
  baseURL: 'https://us1-merry-cat-32748.upstash.io',
});
```

| Option          | Required | Notes                                                                                                                                                                                                 |
| --------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`          | Yes      | `{ type: 'BEARER', token, prefix? }` — the database's REST token, from the Upstash console. `prefix` defaults to RESTler's own default; pass `'Bearer'` to match Upstash's documented casing exactly. |
| `baseURL`       | Yes      | The database's REST URL (e.g. `https://us1-merry-cat-32748.upstash.io`). Per-database — there is no shared default across databases.                                                                  |
| `timeout`       | No       | Request timeout, in seconds. Defaults to `10`.                                                                                                                                                        |
| everything else | No       | Any other {@link RESTlerOptions} field (`headers`, `witness`, `headerProvider`, ...) passes straight through.                                                                                         |

A missing or malformed `auth` throws `UpstashRedisError` (`CONFIG_INVALID_TOKEN`)
at construction time — before any request is made.

## Request convention: JSON command arrays, not path-style URLs

Every command below is sent as `POST /` (the base URL's root, no path
segment) with a JSON array body — the command name followed by its
arguments, e.g. `["SET", "foo", "bar", "EX", 100]`. Upstash also documents
an alternative path-style form (`POST /set/foo/bar?EX=100`), but this
connect only ever uses the array form: it has no ambiguity around
URL-encoding special characters or binary-looking values, which the
path-style form's documentation leaves unspecified. If you use
`execute()` or `pipeline()` directly, build your command arrays the same
way.

Every command element must be a `string` or a `number` — never a
`boolean` or other value — and this connect validates that locally,
before sending, via `CommandSchemaObject` (see
[Schemas](UpstashRedis-Schemas.md)).

## Endpoints

| Method                      | Command(s)       | Result                                         |
| --------------------------- | ---------------- | ---------------------------------------------- |
| `get(key)`                  | `GET`            | `string \| null`                               |
| `set(key, value, options?)` | `SET`            | `'OK' \| null`                                 |
| `del(keys)`                 | `DEL`            | `number` (keys removed)                        |
| `exists(keys)`              | `EXISTS`         | `number` (keys that exist)                     |
| `expire(key, seconds)`      | `EXPIRE`         | `number` (`1` set, `0` key missing)            |
| `incr(key)`                 | `INCR`           | `number`                                       |
| `incrby(key, amount)`       | `INCRBY`         | `number`                                       |
| `hget(key, field)`          | `HGET`           | `string \| null`                               |
| `hset(key, fields)`         | `HSET`           | `number` (fields newly added)                  |
| `lpush(key, ...values)`     | `LPUSH`          | `number` (list length)                         |
| `rpush(key, ...values)`     | `RPUSH`          | `number` (list length)                         |
| `lrange(key, start, stop)`  | `LRANGE`         | `(string \| null)[]`                           |
| `pipeline(commands)`        | `POST /pipeline` | one `{result}`/`{error}` per command, in order |
| `execute(command)`          | `POST /` (raw)   | `unknown` — low-level escape hatch             |

`set()`'s `options.ex`/`options.px` (expiry, in seconds/milliseconds) are
mutually exclusive, as are `options.nx`/`options.xx` (existence
conditions) — passing both of either pair throws `UpstashRedisError`
(`INVALID_REQUEST`) before any request is sent, mirroring real Redis's
own `SET` command.

`del()`/`exists()` accept a single key (`string`) or an array of keys
(`string[]`), matching Redis's own variadic `DEL`/`EXISTS`. `hset()`
accepts a field-value record (`Record<string, string | number>`) rather
than a single field/value pair, since `HSET` is itself variadic —
`hset('key', { a: 1, b: 2 })` sends one `HSET key a 1 b 2` command.

### Pipelining is not atomic

`pipeline()` batches multiple commands into one HTTP round trip via
`POST /pipeline`, but Upstash explicitly documents that it is **not**
atomic: commands run in order, but another client's commands can
interleave between two pipelined commands. Use it purely to reduce round
trips, not as a transaction — Upstash's `/multi-exec` endpoint (not
covered by this connect) is the atomic alternative. Each entry in the
returned array is independently a `{ result }` or `{ error }` — one
command failing does not abort the rest of the pipeline, and the response
array is always in the same order as the request.

See [Errors](UpstashRedis-Errors.md) for failure handling and
[Schemas](UpstashRedis-Schemas.md) for request/response validation.

---

[← Back to UpstashRedis](../README.md)
