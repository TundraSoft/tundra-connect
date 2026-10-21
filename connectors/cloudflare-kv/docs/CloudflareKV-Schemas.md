# CloudflareKV Schemas

Public Guardian schemas, exported from `@tundraconnect/cloudflare-kv/schemas`.

```ts
import {
  KeyPageSchemaObject,
  NamespaceSchemaObject,
} from '@tundraconnect/cloudflare-kv/schemas';
```

| Export                                               | Type                             | Used for                                       |
| ---------------------------------------------------- | -------------------------------- | ---------------------------------------------- |
| `NamespaceSchemaObject`                              | `NamespaceSchema`                | One namespace.                                 |
| `NamespacePageSchemaObject`                          | `NamespacePageSchema`            | `listNamespaces` — `{ result, result_info? }`. |
| `ListNamespacesQuerySchemaObject`                    | `ListNamespacesQuerySchema`      | `listNamespaces` paging and ordering.          |
| `KeySchemaObject`                                    | `KeySchema`                      | One key of a listing.                          |
| `KeyPageSchemaObject`                                | `KeyPageSchema`                  | `listKeys` — `{ result, result_info? }`.       |
| `ListKeysQuerySchemaObject`                          | `ListKeysQuerySchema`            | `listKeys` prefix, limit and cursor.           |
| `BulkResultSchemaObject`                             | `BulkResultSchema`               | `bulkPut` / `bulkDelete` result.               |
| `BulkGetResultSchemaObject`                          | `BulkGetResultSchema`            | `bulkGet` result (`values` by key).            |
| —                                                    | `BulkGetValueWithMetadataSchema` | One `withMetadata` bulk value.                 |
| `ResultInfoSchemaObject`                             | `ResultInfoSchema`               | Cloudflare's paging block, `cursor` included.  |
| `ErrorEnvelopeSchemaObject`                          | `ErrorEnvelopeSchema`            | The failure form of the envelope.              |
| `ErrorItemSchemaObject`                              | `ErrorItemSchema`                | One `errors` entry, with its `error_chain`.    |
| `NAMESPACE_ORDERS`                                   | `readonly ['id', 'title']`       | `listNamespaces` `order` values.               |
| `MIN_NAMESPACES_PER_PAGE`, `MAX_NAMESPACES_PER_PAGE` | `1`, `1000`                      | `listNamespaces` `per_page` bounds.            |
| `MIN_KEYS_LIMIT`, `MAX_KEYS_LIMIT`                   | `10`, `1000`                     | `listKeys` `limit` bounds.                     |
| `MAX_NAMESPACE_TITLE_LENGTH`                         | `512`                            | Longest namespace title.                       |

## Requests are strict, responses are lenient

**Requests** (the query schemas) model Cloudflare's documented bounds so a
mistake is caught before anything is sent. Values, metadata and keys are
checked by the client itself against the Workers KV limits.

**Responses** require only identity fields (`id` and `title` for a
namespace, `name` for a key). Unknown keys pass through, so an additive
field never fails a read, and `metadata` accepts any JSON, `null` included.

`BulkGetResultSchemaObject` is exported for your own use; the client checks
a bulk read's shape by hand instead, because Guardian's record validator
rebuilds the map and drops a key named `__proto__`, which Workers KV allows.

---

[← Back to CloudflareKV](../README.md)
