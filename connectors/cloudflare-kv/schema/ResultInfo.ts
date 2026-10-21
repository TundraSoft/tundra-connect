import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link ResultInfoSchemaObject}: Cloudflare's paging
 * block. Namespace listings page by number (`page`, `per_page`,
 * `total_count`); key listings page by `cursor`.
 */
export type ResultInfoSchema = {
  /** Current page, 1-based (namespace listings). */
  page?: number;
  /** Page size that was applied (namespace listings). */
  per_page?: number;
  /** Number of results on this page. */
  count?: number;
  /** Total results matching the request (namespace listings). */
  total_count?: number;
  /** Total pages at this `per_page`, when Cloudflare reports it. */
  total_pages?: number;
  /**
   * Opaque token for the next page of a key listing. Empty or absent on the
   * last page.
   */
  cursor?: string;
};

/**
 * Schema for the `result_info` a list endpoint carries next to `result`.
 *
 * @example
 * ```typescript
 * import { ResultInfoSchemaObject } from '@tundraconnect/cloudflare-kv/schemas';
 *
 * const [error, info] = ResultInfoSchemaObject.safeParse({
 *   count: 1000,
 *   cursor: '6Ck1la0VxJ0djhidm1MdX2FyDGxLKVeeHZZmORS_8XeSuhz9SjIJRaSa2lnsF01tQOHrfTGAP3R5X1Kv5iVUuMbNKhWNAXHOl6ePB0TUL8nw',
 * });
 * ```
 */
export const ResultInfoSchemaObject: BaseGuardian<ResultInfoSchema> = Guardian
  .object({
    page: Guardian.number().optional(),
    per_page: Guardian.number().optional(),
    count: Guardian.number().optional(),
    total_count: Guardian.number().optional(),
    total_pages: Guardian.number().optional(),
    cursor: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'Result info',
    description: 'Paging information on a Cloudflare list response.',
  });
