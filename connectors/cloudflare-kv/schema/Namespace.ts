import { type BaseGuardian, Guardian } from '@guardian';
import { type ResultInfoSchema, ResultInfoSchemaObject } from './ResultInfo.ts';

/** Longest namespace title Cloudflare accepts, in characters. */
export const MAX_NAMESPACE_TITLE_LENGTH = 512;

/** Cloudflare's `per_page` bounds for namespaces. */
export const MIN_NAMESPACES_PER_PAGE = 1;
export const MAX_NAMESPACES_PER_PAGE = 1000;

/** Fields `listNamespaces` can order by. */
export const NAMESPACE_ORDERS = ['id', 'title'] as const;

/** Type definition for {@link NamespaceSchemaObject}: one Workers KV namespace. */
export type NamespaceSchema = {
  /** Namespace id (32 hex characters). */
  id: string;
  /** Human-readable title, unique within the account. */
  title: string;
  /**
   * `true` when keys in request URLs are URL-decoded before storage — true
   * for every namespace created through the API today.
   */
  supports_url_encoding?: boolean;
  /** Where the data is durably stored (`eu`, `fedramp`, `us`), when restricted. */
  jurisdiction?: string;
  /** Namespace mode (`instant`), when not a classic namespace. */
  mode?: string;
} & Record<string, unknown>;

/**
 * Schema for a Workers KV namespace. Open: fields Cloudflare adds later
 * pass through.
 *
 * @example
 * ```typescript
 * import { NamespaceSchemaObject } from '@tundraconnect/cloudflare-kv/schemas';
 *
 * const [error, namespace] = NamespaceSchemaObject.safeParse({
 *   id: '0f2ac74b498b48028cb68387c421e279',
 *   title: 'redirects',
 *   supports_url_encoding: true,
 * });
 * ```
 */
export const NamespaceSchemaObject: BaseGuardian<NamespaceSchema> = Guardian
  .object({
    id: Guardian.string(),
    title: Guardian.string(),
    supports_url_encoding: Guardian.boolean().strict().optional(),
    jurisdiction: Guardian.string().optional(),
    mode: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'Workers KV namespace',
    description: 'A Workers KV namespace.',
  }) as BaseGuardian<NamespaceSchema>;

/** Type definition for {@link NamespacePageSchemaObject}. */
export type NamespacePageSchema = {
  /** The namespaces on this page. */
  result: NamespaceSchema[];
  /** Paging information. */
  result_info?: ResultInfoSchema;
};

/**
 * Schema for one page of `GET /storage/kv/namespaces`.
 *
 * @example
 * ```typescript
 * import { NamespacePageSchemaObject } from '@tundraconnect/cloudflare-kv/schemas';
 *
 * const [error, page] = NamespacePageSchemaObject.safeParse({
 *   result: [{ id: '0f2ac74b498b48028cb68387c421e279', title: 'redirects' }],
 *   result_info: { page: 1, per_page: 20, count: 1, total_count: 1 },
 * });
 * ```
 */
export const NamespacePageSchemaObject: BaseGuardian<NamespacePageSchema> =
  Guardian.object({
    result: Guardian.array(NamespaceSchemaObject),
    result_info: ResultInfoSchemaObject.optional(),
  }).describe({
    title: 'Workers KV namespace page',
    description: 'One page of Workers KV namespaces with paging information.',
  });

/**
 * Type definition for {@link ListNamespacesQuerySchemaObject}: the paging
 * and ordering of `GET /storage/kv/namespaces`, with Cloudflare's own names.
 */
export type ListNamespacesQuerySchema = {
  /** Page number, from 1. @default 1 */
  page?: number;
  /** Namespaces per page, 1–1000. @default 20 */
  per_page?: number;
  /** Field to order by. */
  order?: typeof NAMESPACE_ORDERS[number];
  /** Sort direction. */
  direction?: 'asc' | 'desc';
};

/**
 * Schema for the `listNamespaces` query.
 *
 * @example
 * ```typescript
 * import { ListNamespacesQuerySchemaObject } from '@tundraconnect/cloudflare-kv/schemas';
 *
 * const [error, query] = ListNamespacesQuerySchemaObject.safeParse({
 *   per_page: 100,
 *   order: 'title',
 * });
 * ```
 */
export const ListNamespacesQuerySchemaObject: BaseGuardian<
  ListNamespacesQuerySchema
> = Guardian.object({
  page: Guardian.number().integer().min(1, '`page` starts at 1').optional(),
  per_page: Guardian.number().integer().range(
    MIN_NAMESPACES_PER_PAGE,
    MAX_NAMESPACES_PER_PAGE,
    `\`per_page\` must be between ${MIN_NAMESPACES_PER_PAGE} and ${MAX_NAMESPACES_PER_PAGE}`,
  ).optional(),
  order: Guardian.enum(NAMESPACE_ORDERS).optional(),
  direction: Guardian.enum(['asc', 'desc'] as const).optional(),
}).describe({
  title: 'List namespaces query',
  description: 'Paging and ordering for listing Workers KV namespaces.',
});
