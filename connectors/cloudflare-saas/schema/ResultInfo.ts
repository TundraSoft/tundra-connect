import { type BaseGuardian, Guardian } from '@guardian';

/** Type definition for {@link ResultInfoSchemaObject}: Cloudflare's paging block. */
export type ResultInfoSchema = {
  /** Current page, 1-based. */
  page?: number;
  /** Page size that was applied. */
  per_page?: number;
  /** Number of results on this page. */
  count?: number;
  /** Total results matching the filters. */
  total_count?: number;
  /** Total pages at this `per_page`. */
  total_pages?: number;
};

/**
 * Schema for the `result_info` a list endpoint carries next to `result`.
 *
 * @example
 * ```typescript
 * import { ResultInfoSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, info] = ResultInfoSchemaObject.safeParse({
 *   page: 1,
 *   per_page: 20,
 *   count: 3,
 *   total_count: 3,
 *   total_pages: 1,
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
  }).passthrough().describe({
    title: 'Result info',
    description: 'Paging information on a Cloudflare list response.',
  });
