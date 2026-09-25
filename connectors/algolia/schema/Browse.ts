import { type BaseGuardian, Guardian } from '@guardian';
import {
  type AlgoliaObjectSchema,
  AlgoliaObjectSchemaObject,
} from './Common.ts';

/**
 * Type definition for a {@link Algolia.browseObjects} request body.
 *
 * Hand-written (rather than derived via `GuardianInfer`) so the exported
 * schema below can carry an explicit `BaseGuardian<BrowseRequestSchema>`
 * annotation with no unannotated intermediate — JSR's "slow types" check
 * requires the originating declaration of any type reachable from the
 * public API to be explicit.
 */
export type BrowseRequestSchema = {
  /** Opaque continuation token from a previous {@link BrowseResponseSchema}. Omit to start a new scan. */
  cursor?: string;
  /** Records per page. Algolia defaults to 1000 when omitted. */
  hitsPerPage?: number;
  /** Optional full-text filter applied while scanning (rarely used — browse is normally an unfiltered full scan). */
  query?: string;
  /** Algolia filter expression, same syntax as {@link Algolia.search}. */
  filters?: string;
};

/**
 * Schema for a {@link Algolia.browseObjects} request body.
 *
 * Browse is a distinct, cursor-based full-scan mechanism — not the same
 * operation as {@link Algolia.search} paginated with `page`/`hitsPerPage}.
 * The first call omits `cursor`; every subsequent call passes back the
 * `cursor` from the previous {@link BrowseResponseSchema}, until the
 * response omits `cursor`, which signals the scan is complete.
 *
 * @example
 * ```typescript
 * import { BrowseRequestSchemaObject } from '@tundraconnect/algolia/schemas';
 *
 * const [error, request] = BrowseRequestSchemaObject.safeParse({
 *   hitsPerPage: 1000,
 * });
 * ```
 */
export const BrowseRequestSchemaObject: BaseGuardian<BrowseRequestSchema> =
  Guardian.object({
    /** Opaque continuation token from a previous {@link BrowseResponseSchema}. Omit to start a new scan. */
    cursor: Guardian.string().optional(),
    /** Records per page. Algolia defaults to 1000 when omitted. */
    hitsPerPage: Guardian.number().integer().min(1).optional(),
    /** Optional full-text filter applied while scanning (rarely used — browse is normally an unfiltered full scan). */
    query: Guardian.string().optional(),
    /** Algolia filter expression, same syntax as {@link Algolia.search}. */
    filters: Guardian.string().optional(),
  }).describe({
    title: 'Algolia browse request',
    description: 'Request body for `POST /1/indexes/{indexName}/browse`.',
  });

/**
 * Type definition for a {@link Algolia.browseObjects} response body.
 *
 * Hand-written for the same reason as {@link BrowseRequestSchema} — no
 * unannotated intermediate reachable from the public API.
 */
export type BrowseResponseSchema = {
  /** Records in this page of the scan. */
  hits: AlgoliaObjectSchema[];
  /** Pass back as `cursor` in the next call to continue the scan. Absent once the scan reaches the end. */
  cursor?: string;
  /** Time Algolia spent processing this page, in milliseconds. */
  processingTimeMS?: number;
};

/**
 * Schema for a {@link Algolia.browseObjects} response body.
 *
 * @example
 * ```typescript
 * import { BrowseResponseSchemaObject } from '@tundraconnect/algolia/schemas';
 *
 * const [error, response] = BrowseResponseSchemaObject.safeParse({
 *   hits: [{ objectID: '1', name: 'Red sneakers' }],
 *   cursor: 'opaque-cursor-token',
 *   processingTimeMS: 3,
 * });
 * ```
 */
export const BrowseResponseSchemaObject: BaseGuardian<BrowseResponseSchema> =
  Guardian.object({
    /** Records in this page of the scan. */
    hits: Guardian.array(AlgoliaObjectSchemaObject),
    /** Pass back as `cursor` in the next call to continue the scan. Absent once the scan reaches the end. */
    cursor: Guardian.string().optional(),
    /** Time Algolia spent processing this page, in milliseconds. */
    processingTimeMS: Guardian.number().integer().min(0).optional(),
  }).passthrough().describe({
    title: 'Algolia browse response',
    description: 'Response body for `POST /1/indexes/{indexName}/browse`.',
  });
