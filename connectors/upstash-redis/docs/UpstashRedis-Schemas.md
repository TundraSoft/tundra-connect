# UpstashRedis Schemas

The `@tundraconnect/upstash-redis/schemas` subpath exports Guardian
validators and inferred types for every request/response shape this
connect sends or receives.

```ts
import {
  CommandSchemaObject,
  PipelineResponseSchemaObject,
} from '@tundraconnect/upstash-redis/schemas';

const [error, command] = CommandSchemaObject.safeParse([
  'SET',
  'foo',
  'bar',
  'EX',
  100,
]);
```

| Schema                         | Shape                                       | Used by                                                                       |
| ------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------- |
| `CommandSchemaObject`          | `(string \| number)[]`                      | Every method's request body (`POST /`), and each entry of a pipeline request. |
| `ErrorSchemaObject`            | `{ error: string }`                         | Parsed from the response body on HTTP `400`.                                  |
| `StringResultSchemaObject`     | `{ result: string \| null }`                | `GET`, `HGET`                                                                 |
| `StatusResultSchemaObject`     | `{ result: 'OK' \| null }`                  | `SET`                                                                         |
| `IntegerResultSchemaObject`    | `{ result: number }`                        | `DEL`, `EXISTS`, `INCR`, `INCRBY`, `EXPIRE`, `HSET`, `LPUSH`, `RPUSH`         |
| `ArrayResultSchemaObject`      | `{ result: (string \| null)[] }`            | `LRANGE`                                                                      |
| `AnyResultSchemaObject`        | `{ result?: unknown }`                      | `execute()` — the untyped escape hatch                                        |
| `PipelineRequestSchemaObject`  | `(string \| number)[][]`                    | `pipeline()`'s request body (`POST /pipeline`)                                |
| `PipelineResultSchemaObject`   | `{ result?: unknown } \| { error: string }` | One entry of a pipeline response                                              |
| `PipelineResponseSchemaObject` | `PipelineResultSchema[]`                    | `pipeline()`'s full response body                                             |

## A note on coercion

This connect's schemas build on `@tundralibs/guardian`'s `Guardian.string()`
and `Guardian.number()`, which **coerce by default** (`Guardian.number().parse('42') === 42`).
`CommandSchemaObject` deliberately does _not_ use them for its array
elements — coercion would silently turn every numeric command argument
(e.g. `SET`'s `EX 100`) into a string, and would coerce a stray `boolean`
into `0`/`1` instead of rejecting it. It instead uses a plain
`Guardian.unknown().refine(...)` type-predicate, which preserves the
original value exactly and only rejects what isn't a `string` or
`number`. Every other schema in this connect uses the library's normal
coercing guards, matching the rest of this repo's connects.

## Hand-written types, not `GuardianInfer`

Every schema in this connect hand-writes its exported TypeScript type and
annotates the exported `Guardian`-producing const with it directly (see
`schema/Error.ts` for the reasoning in full) — rather than inferring the
type from an unexported intermediate const via `GuardianInfer<typeof _x>`.
Both patterns type-check locally, but only the hand-written form survives
JSR's slow-types check (`deno publish --dry-run`), which needs an
explicit, non-circular type for every symbol reachable from this
package's public API.

---

[← Back to UpstashRedis](../README.md)
