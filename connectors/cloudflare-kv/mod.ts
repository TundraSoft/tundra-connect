/**
 * Read and write Cloudflare Workers KV from outside a Worker, over the
 * `client/v4` REST API: namespaces (list, create, get, rename, delete), key
 * listings with cursor paging or an async iterator, single values as text,
 * JSON or bytes with metadata and expiry, and the bulk write, delete and
 * read endpoints, split automatically to fit Cloudflare's per-request
 * limits.
 *
 * Typed Cloudflare Workers KV REST client for Deno, Bun, Node.js and
 * Cloudflare Workers: namespaces, keys, values with metadata and expiry,
 * and auto-split bulk writes, deletes and reads, with limit checks and
 * retries.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`CloudflareKVError`, `CloudflareKVRateLimitError` and the code registry).
 *
 * @example
 * ```ts
 * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
 * import { CloudflareKVError } from '@tundraconnect/cloudflare-kv/errors';
 *
 * const kv = new CloudflareKV({
 *   auth: { type: 'BEARER', token: Deno.env.get('CF_API_TOKEN')! },
 *   accountId: Deno.env.get('CF_ACCOUNT_ID')!,
 *   namespaceId: Deno.env.get('CF_KV_NAMESPACE_ID')!,
 * });
 *
 * try {
 *   // Publish a batch of redirects, then read one back.
 *   await kv.bulkPut([
 *     { key: 'r:acme', value: 'https://acme.example', metadata: { owner: 'acme' } },
 *     { key: 'r:beta', value: 'https://beta.example', expiration_ttl: 86_400 },
 *   ]);
 *   console.log(await kv.get('r:acme'));
 *
 *   // Retire them.
 *   await kv.bulkDelete(['r:acme', 'r:beta']);
 * } catch (err) {
 *   if (err instanceof CloudflareKVError) {
 *     // Branch on the stable code name, never on a message substring.
 *     console.error(err.code, err.status, err.vendorCode, err.transient);
 *   }
 *   throw err;
 * }
 * ```
 *
 * @module
 */

// Export main client class
export {
  type BulkGetOptions,
  type BulkPutEntry,
  CLOUDFLARE_API,
  CloudflareKV,
  type CloudflareKVAuth,
  type CloudflareKVOptions,
  type CloudflareKVRetryOptions,
  type GetOptions,
  type KvExpiration,
  type KvKeyMetadata,
  type KvValue,
  type KvValueType,
  type KvValueWithMetadata,
  type ListKeysOptions,
  type ListNamespacesOptions,
  MAX_BULK_DELETE_KEYS,
  MAX_BULK_GET_KEYS,
  MAX_BULK_WRITE_BYTES,
  MAX_BULK_WRITE_KEYS,
  MAX_KEY_BYTES,
  MAX_METADATA_BYTES,
  MAX_VALUE_BYTES,
  MIN_EXPIRATION_TTL,
  type NamespaceScoped,
  type PutOptions,
  type RequestOptions,
} from './CloudflareKV.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
