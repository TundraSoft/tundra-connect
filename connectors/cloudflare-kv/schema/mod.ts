/**
 * Guardian schemas and inferred types for the Cloudflare Workers KV REST
 * API: namespaces, key listings, bulk results, the paging block and the
 * error envelope. Field names are Cloudflare's own (`per_page`,
 * `result_info`, `successful_key_count`), so a schema reads like the API
 * reference.
 *
 * @example
 * ```ts
 * import { KeyPageSchemaObject } from '@tundraconnect/cloudflare-kv/schemas';
 *
 * const [error, page] = KeyPageSchemaObject.safeParse({
 *   result: [{ name: 'r:acme', metadata: { owner: 'acme' } }],
 *   result_info: { count: 1, cursor: '' },
 * });
 * if (!error) console.log(page?.result[0]?.name);
 * ```
 *
 * @module
 */

export {
  type BulkGetResultSchema,
  BulkGetResultSchemaObject,
  type BulkGetValueWithMetadataSchema,
  type BulkResultSchema,
  BulkResultSchemaObject,
} from './Bulk.ts';
export {
  type ErrorEnvelopeSchema,
  ErrorEnvelopeSchemaObject,
  type ErrorItemSchema,
  ErrorItemSchemaObject,
} from './Error.ts';
export {
  type KeyPageSchema,
  KeyPageSchemaObject,
  type KeySchema,
  KeySchemaObject,
  type ListKeysQuerySchema,
  ListKeysQuerySchemaObject,
  MAX_KEYS_LIMIT,
  MIN_KEYS_LIMIT,
} from './Key.ts';
export {
  type ListNamespacesQuerySchema,
  ListNamespacesQuerySchemaObject,
  MAX_NAMESPACE_TITLE_LENGTH,
  MAX_NAMESPACES_PER_PAGE,
  MIN_NAMESPACES_PER_PAGE,
  NAMESPACE_ORDERS,
  type NamespacePageSchema,
  NamespacePageSchemaObject,
  type NamespaceSchema,
  NamespaceSchemaObject,
} from './Namespace.ts';
export { type ResultInfoSchema, ResultInfoSchemaObject } from './ResultInfo.ts';
