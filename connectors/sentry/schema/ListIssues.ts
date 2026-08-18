import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';
import { ISSUE_SORT_OPTIONS } from './Common.ts';
import { type IssueSchema, IssueSchemaObject } from './Issue.ts';

/**
 * Schema for {@link Sentry.listIssues} request options — filter/pagination
 * options accepted by `GET /organizations/{org}/issues/`
 * (https://docs.sentry.io/api/events/list-an-organizations-issues/).
 *
 * `project` is validated here as an array (Sentry documents it as
 * repeatable — `?project=1&project=2`), but the underlying
 * `RESTlerEndpoint.query` is a plain `Record<string, string>` (one value per
 * key) and cannot express a repeated key; {@link Sentry.listIssues} builds
 * the query string itself for this reason — see its `__query` helper.
 *
 * @example
 * ```typescript
 * import { ListIssuesRequestSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * const [error, options] = ListIssuesRequestSchemaObject.safeParse({
 *   project: ['1234'],
 *   query: 'is:unresolved',
 *   sort: 'freq',
 * });
 * ```
 */
type _ListIssuesRequestShape = {
  project?: string[];
  query?: string;
  environment?: string[];
  statsPeriod?: string;
  sort?: (typeof ISSUE_SORT_OPTIONS)[number];
  cursor?: string;
  limit?: number;
};

const _listIssuesRequestSchema: BaseGuardian<_ListIssuesRequestShape> = Guardian
  .object({
    /** Project IDs or slugs to filter by; omit to search across every project the token can access. */
    project: Guardian.array(Guardian.string().minLength(1)).optional(),
    /** Sentry structured search query (defaults to `is:unresolved` on the vendor side). */
    query: Guardian.string().optional(),
    /** Environment names to filter by. */
    environment: Guardian.array(Guardian.string().minLength(1)).optional(),
    /** Time window for inline stats, e.g. `'24h'` or `'14d'`. */
    statsPeriod: Guardian.string().minLength(1).optional(),
    /** Sort order for the results. */
    sort: Guardian.enum(ISSUE_SORT_OPTIONS).optional(),
    /** Opaque pagination cursor, taken from a previous page's `nextCursor`. */
    cursor: Guardian.string().minLength(1).optional(),
    /** Results per page (1-100). */
    limit: Guardian.number().integer().min(1).max(100).optional(),
  }).describe({
    title: 'List issues request',
    description:
      'Filter/pagination options accepted by Sentry.listIssues(), validated before the API call.',
  });

/** Type definition for {@link Sentry.listIssues} request options. */
export type ListIssuesRequestSchema = GuardianInfer<
  typeof _listIssuesRequestSchema
>;

export const ListIssuesRequestSchemaObject: BaseGuardian<
  ListIssuesRequestSchema
> = _listIssuesRequestSchema;

/**
 * Schema for the paginated `GET /organizations/{org}/issues/` response —
 * Sentry returns a bare JSON array, so this wraps it under `issues`
 * alongside a convenience `nextCursor` (see
 * {@link ListProjectsResponseSchemaObject} for why it's threaded in by the
 * client rather than derived here via `.transform()`).
 *
 * @example
 * ```typescript
 * import { ListIssuesResponseSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * const [error, page] = ListIssuesResponseSchemaObject.safeParse({ issues: [] });
 * if (!error) {
 *   console.log('Issues on this page:', page.issues.length);
 * }
 * ```
 */
type _ListIssuesResponseShape = {
  issues: IssueSchema[];
  /** Sentry's next-page cursor, extracted from the `Link` response header. `undefined` on the last page. */
  nextCursor?: string;
};

const _listIssuesResponseSchema: BaseGuardian<_ListIssuesResponseShape> =
  Guardian
    .object({
      /** The page of Issue resources. */
      issues: Guardian.array(IssueSchemaObject),
      /** Sentry's next-page cursor, extracted from the `Link` response header. */
      nextCursor: Guardian.string().optional(),
    }).describe({
      title: 'List issues response',
      description:
        "A paginated page of an organization's Issue resources, with a convenience nextCursor.",
    });

/** Type definition for the paginated list-issues response. */
export type ListIssuesResponseSchema = GuardianInfer<
  typeof _listIssuesResponseSchema
>;

export const ListIssuesResponseSchemaObject: BaseGuardian<
  ListIssuesResponseSchema
> = _listIssuesResponseSchema;
