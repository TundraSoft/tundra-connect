# Algolia Schemas

The `@tundraconnect/algolia/schemas` subpath exports Guardian validators and
inferred types for every request/response shape this connect models.

```ts
import {
  SearchRequestSchemaObject,
  type SearchResponseSchema,
} from '@tundraconnect/algolia/schemas';

const [error, request] = SearchRequestSchemaObject.safeParse({
  query: 'red shoes',
  hitsPerPage: 20,
});
```

## Object model

An Algolia index record is arbitrary user-supplied JSON plus the one field
Algolia itself always manages: `objectID`. This connect deliberately does
**not** try to model what's inside your records — `AlgoliaObjectSchema`
requires only `objectID` and passes every other field through untouched.

| Schema                       | File               | Description                                                                                                       |
| ---------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `AlgoliaObjectSchema`        | `schema/Common.ts` | A saved/returned record: `{ objectID: string } & Record<string, unknown>`.                                        |
| `AlgoliaObjectPayloadSchema` | `schema/Common.ts` | The arbitrary JSON object sent to `saveObject` — validated only as "is a plain object," not array/primitive/null. |
| `ErrorEnvelopeSchema`        | `schema/Error.ts`  | Algolia's `{ message, status }` error response body.                                                              |

## Per-endpoint request/response schemas

| Schema                       | File                     | Used by                       |
| ---------------------------- | ------------------------ | ----------------------------- |
| `SearchRequestSchema`        | `schema/Search.ts`       | `search` request body         |
| `SearchResponseSchema`       | `schema/Search.ts`       | `search` response body        |
| `SaveObjectResponseSchema`   | `schema/SaveObject.ts`   | `saveObject` response body    |
| `DeleteObjectResponseSchema` | `schema/DeleteObject.ts` | `deleteObject` response body  |
| `BrowseRequestSchema`        | `schema/Browse.ts`       | `browseObjects` request body  |
| `BrowseResponseSchema`       | `schema/Browse.ts`       | `browseObjects` response body |
| `TaskStatusSchema`           | `schema/Task.ts`         | `waitTask` poll response body |

`getObject` returns `AlgoliaObjectSchema` directly (no dedicated
`GetObject.ts` file — it reuses `schema/Common.ts`'s shared record shape).

Every schema follows the repo-wide convention: a single Guardian object per
file, an explicit `BaseGuardian<T>`-annotated export, `.describe()` for
generated documentation, and a matching `.test.ts` covering both accepted
and rejected payloads.

---

[← Back to Algolia](../README.md)
