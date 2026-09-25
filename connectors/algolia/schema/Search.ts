import { type BaseGuardian, Guardian } from '@guardian';
import {
  type AlgoliaObjectSchema,
  AlgoliaObjectSchemaObject,
} from './Common.ts';

/**
 * Type definition for a {@link Algolia.search} request body.
 *
 * Hand-written (rather than derived via `GuardianInfer`) so the exported
 * schema below can carry an explicit `BaseGuardian<SearchRequestSchema>`
 * annotation with no unannotated intermediate — JSR's "slow types" check
 * requires the originating declaration of any type reachable from the
 * public API to be explicit.
 */
export type SearchRequestSchema = {
  /** Full-text search query. An empty string matches every record. */
  query: string;
  /** Number of hits per page. Algolia defaults to 20 when omitted. */
  hitsPerPage?: number;
  /** Zero-based page number. Algolia defaults to 0 when omitted. */
  page?: number;
  /** Algolia filter expression (e.g. `'category:footwear AND price < 50'`). */
  filters?: string;
};

/**
 * Schema for a {@link Algolia.search} request body.
 *
 * `query` is required but may be an empty string — Algolia treats an empty
 * query as "match every record," which is a documented, valid use.
 *
 * @example
 * ```typescript
 * import { SearchRequestSchemaObject } from '@tundraconnect/algolia/schemas';
 *
 * const [error, request] = SearchRequestSchemaObject.safeParse({
 *   query: 'red shoes',
 *   hitsPerPage: 20,
 *   filters: 'category:footwear',
 * });
 * ```
 */
export const SearchRequestSchemaObject: BaseGuardian<SearchRequestSchema> =
  Guardian.object({
    /** Full-text search query. An empty string matches every record. */
    query: Guardian.string(),
    /** Number of hits per page. Algolia defaults to 20 when omitted. */
    hitsPerPage: Guardian.number().integer().min(1).optional(),
    /** Zero-based page number. Algolia defaults to 0 when omitted. */
    page: Guardian.number().integer().min(0).optional(),
    /** Algolia filter expression (e.g. `'category:footwear AND price < 50'`). */
    filters: Guardian.string().optional(),
  }).describe({
    title: 'Algolia search request',
    description: 'Request body for `POST /1/indexes/{indexName}/query`.',
  });

/**
 * Type definition for a {@link Algolia.search} response body.
 *
 * Hand-written for the same reason as {@link SearchRequestSchema} — no
 * unannotated intermediate reachable from the public API.
 */
export type SearchResponseSchema = {
  /** Matched records for this page. */
  hits: AlgoliaObjectSchema[];
  /** Total number of matching records across every page. */
  nbHits: number;
  /** Zero-based index of the returned page. */
  page: number;
  /** Total number of pages available. */
  nbPages: number;
  /** Time Algolia spent processing the query, in milliseconds. */
  processingTimeMS: number;
  /** The query string that was actually searched (echoes the request). */
  query: string;
};

/**
 * Schema for a {@link Algolia.search} response body.
 *
 * @example
 * ```typescript
 * import { SearchResponseSchemaObject } from '@tundraconnect/algolia/schemas';
 *
 * const [error, response] = SearchResponseSchemaObject.safeParse({
 *   hits: [{ objectID: '1', name: 'Red sneakers' }],
 *   nbHits: 1,
 *   page: 0,
 *   nbPages: 1,
 *   processingTimeMS: 2,
 *   query: 'red shoes',
 * });
 * ```
 */
export const SearchResponseSchemaObject: BaseGuardian<SearchResponseSchema> =
  Guardian.object({
    /** Matched records for this page. */
    hits: Guardian.array(AlgoliaObjectSchemaObject),
    /** Total number of matching records across every page. */
    nbHits: Guardian.number().integer().min(0),
    /** Zero-based index of the returned page. */
    page: Guardian.number().integer().min(0),
    /** Total number of pages available. */
    nbPages: Guardian.number().integer().min(0),
    /** Time Algolia spent processing the query, in milliseconds. */
    processingTimeMS: Guardian.number().integer().min(0),
    /** The query string that was actually searched (echoes the request). */
    query: Guardian.string(),
  }).passthrough().describe({
    title: 'Algolia search response',
    description: 'Response body for `POST /1/indexes/{indexName}/query`.',
  });
