import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';
import { type ProjectSchema, ProjectSchemaObject } from './Project.ts';

/**
 * Schema for {@link Sentry.listProjects} request options — filter/pagination
 * options accepted by `GET /organizations/{org}/projects/`
 * (https://docs.sentry.io/api/organizations/list-an-organizations-projects/).
 *
 * @example
 * ```typescript
 * import { ListProjectsRequestSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * const [error, options] = ListProjectsRequestSchemaObject.safeParse({
 *   perPage: 50,
 * });
 * ```
 */
type _ListProjectsRequestShape = {
  cursor?: string;
  perPage?: number;
  query?: string;
};

const _listProjectsRequestSchema: BaseGuardian<_ListProjectsRequestShape> =
  Guardian.object({
    /** Opaque pagination cursor, taken from a previous page's `nextCursor`. */
    cursor: Guardian.string().minLength(1).optional(),
    /** Results per page (1-100, vendor default 100). */
    perPage: Guardian.number().integer().min(1).max(100).optional(),
    /** Filter projects by name or slug. */
    query: Guardian.string().minLength(1).optional(),
  }).describe({
    title: 'List projects request',
    description:
      'Filter/pagination options accepted by Sentry.listProjects(), validated before the API call.',
  });

/** Type definition for {@link Sentry.listProjects} request options. */
export type ListProjectsRequestSchema = GuardianInfer<
  typeof _listProjectsRequestSchema
>;

export const ListProjectsRequestSchemaObject: BaseGuardian<
  ListProjectsRequestSchema
> = _listProjectsRequestSchema;

/**
 * Schema for the paginated `GET /organizations/{org}/projects/` response —
 * Sentry returns a bare JSON array, so this wraps it under `projects`
 * alongside a convenience `nextCursor`, extracted by
 * {@link Sentry.listProjects} from the response's `Link` header (RFC 5988) —
 * Guardian schemas only ever see the response body, never headers, so
 * `nextCursor` is threaded in by the client before this schema validates,
 * rather than derived here via `.transform()`.
 *
 * @example
 * ```typescript
 * import { ListProjectsResponseSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * const [error, page] = ListProjectsResponseSchemaObject.safeParse({
 *   projects: [],
 *   nextCursor: undefined,
 * });
 * if (!error) {
 *   console.log('Projects on this page:', page.projects.length);
 * }
 * ```
 */
type _ListProjectsResponseShape = {
  projects: ProjectSchema[];
  /** Sentry's next-page cursor, extracted from the `Link` response header. `undefined` on the last page. */
  nextCursor?: string;
};

const _listProjectsResponseSchema: BaseGuardian<_ListProjectsResponseShape> =
  Guardian.object({
    /** The page of Project resources. */
    projects: Guardian.array(ProjectSchemaObject),
    /** Sentry's next-page cursor, extracted from the `Link` response header. */
    nextCursor: Guardian.string().optional(),
  }).describe({
    title: 'List projects response',
    description:
      "A paginated page of an organization's Project resources, with a convenience nextCursor.",
  });

/** Type definition for the paginated list-projects response. */
export type ListProjectsResponseSchema = GuardianInfer<
  typeof _listProjectsResponseSchema
>;

export const ListProjectsResponseSchemaObject: BaseGuardian<
  ListProjectsResponseSchema
> = _listProjectsResponseSchema;
