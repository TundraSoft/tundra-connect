import { type BaseGuardian, Guardian } from '@guardian';
import { type ResultInfoSchema, ResultInfoSchemaObject } from './ResultInfo.ts';

/** Cloudflare's `limit` bounds for a key listing. */
export const MIN_KEYS_LIMIT = 10;
export const MAX_KEYS_LIMIT = 1000;

/**
 * Type definition for {@link KeySchemaObject}: one entry of a key listing —
 * the name, plus the expiration and metadata when the key has them. Values
 * are never part of a listing.
 */
export type KeySchema = {
  /** The key name. */
  name: string;
  /** Expiry in seconds since the UNIX epoch; absent for a key that never expires. */
  expiration?: number;
  /** The metadata stored with the key, when it has any. */
  metadata?: unknown;
} & Record<string, unknown>;

/**
 * Schema for one key of a key listing.
 *
 * @example
 * ```typescript
 * import { KeySchemaObject } from '@tundraconnect/cloudflare-kv/schemas';
 *
 * const [error, key] = KeySchemaObject.safeParse({
 *   name: 'r:acme',
 *   expiration: 1893456000,
 *   metadata: { owner: 'acme' },
 * });
 * ```
 */
export const KeySchemaObject: BaseGuardian<KeySchema> = Guardian.object({
  name: Guardian.string(),
  expiration: Guardian.number().optional(),
  metadata: Guardian.unknown().nullable().optional(),
}).passthrough().describe({
  title: 'Workers KV key',
  description: 'A key name with its expiration and metadata.',
}) as BaseGuardian<KeySchema>;

/** Type definition for {@link KeyPageSchemaObject}. */
export type KeyPageSchema = {
  /** The keys on this page, in lexicographic order. */
  result: KeySchema[];
  /**
   * `count` and, when more keys remain, the `cursor` to pass to the next
   * `listKeys` call.
   */
  result_info?: ResultInfoSchema;
};

/**
 * Schema for one page of `GET /storage/kv/namespaces/{id}/keys`.
 *
 * @example
 * ```typescript
 * import { KeyPageSchemaObject } from '@tundraconnect/cloudflare-kv/schemas';
 *
 * const [error, page] = KeyPageSchemaObject.safeParse({
 *   result: [{ name: 'r:acme' }],
 *   result_info: { count: 1, cursor: '' },
 * });
 * ```
 */
export const KeyPageSchemaObject: BaseGuardian<KeyPageSchema> = Guardian
  .object({
    result: Guardian.array(KeySchemaObject),
    result_info: ResultInfoSchemaObject.optional(),
  }).describe({
    title: 'Workers KV key page',
    description: 'One page of key names with the cursor for the next.',
  });

/**
 * Type definition for {@link ListKeysQuerySchemaObject}: the filter and
 * paging of a key listing, with Cloudflare's own names.
 */
export type ListKeysQuerySchema = {
  /** Only keys whose name starts with this prefix. */
  prefix?: string;
  /** Keys per page, 10–1000. @default 1000 */
  limit?: number;
  /** The `result_info.cursor` of the previous page. */
  cursor?: string;
};

/**
 * Schema for the `listKeys` query.
 *
 * @example
 * ```typescript
 * import { ListKeysQuerySchemaObject } from '@tundraconnect/cloudflare-kv/schemas';
 *
 * const [error, query] = ListKeysQuerySchemaObject.safeParse({
 *   prefix: 'r:',
 *   limit: 100,
 * });
 * ```
 */
export const ListKeysQuerySchemaObject: BaseGuardian<ListKeysQuerySchema> =
  Guardian.object({
    prefix: Guardian.string().optional(),
    limit: Guardian.number().integer().range(
      MIN_KEYS_LIMIT,
      MAX_KEYS_LIMIT,
      `\`limit\` must be between ${MIN_KEYS_LIMIT} and ${MAX_KEYS_LIMIT}`,
    ).optional(),
    cursor: Guardian.string().optional(),
  }).describe({
    title: 'List keys query',
    description: 'Prefix filter and cursor paging for listing keys.',
  });
