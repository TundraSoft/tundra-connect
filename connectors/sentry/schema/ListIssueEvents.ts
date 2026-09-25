import { type BaseGuardian, Guardian } from '@guardian';
import { type IssueEventSchema, IssueEventSchemaObject } from './IssueEvent.ts';

/**
 * Schema for {@link Sentry.listIssueEvents} request options —
 * filter/pagination options accepted by
 * `GET /organizations/{org}/issues/{issue_id}/events/`
 * (https://docs.sentry.io/api/events/list-an-issues-events/).
 *
 * @example
 * ```typescript
 * import { ListIssueEventsRequestSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * const [error, options] = ListIssueEventsRequestSchemaObject.safeParse({
 *   statsPeriod: '14d',
 *   full: true,
 * });
 * ```
 */
export type ListIssueEventsRequestSchema = {
  start?: string;
  end?: string;
  statsPeriod?: string;
  environment?: string;
  full?: boolean;
  query?: string;
  perPage?: number;
  cursor?: string;
};

const _listIssueEventsRequestSchema: BaseGuardian<
  ListIssueEventsRequestSchema
> = Guardian.object({
  /** ISO 8601 start of the date range to filter by; requires `end`. */
  start: Guardian.string().minLength(1).optional(),
  /** ISO 8601 end of the date range to filter by; requires `start`. */
  end: Guardian.string().minLength(1).optional(),
  /** Relative time window, e.g. `'24h'` or `'7d'`; ignored if `start`/`end` are set. */
  statsPeriod: Guardian.string().minLength(1).optional(),
  /** Environment name to filter by. */
  environment: Guardian.string().minLength(1).optional(),
  /** Return the complete event body (stacktrace, breadcrumbs, ...) instead of the summary. */
  full: Guardian.boolean().optional(),
  /** Sentry structured search query. */
  query: Guardian.string().optional(),
  /** Results per page (1-100). */
  perPage: Guardian.number().integer().min(1).max(100).optional(),
  /** Opaque pagination cursor, taken from a previous page's `nextCursor`. */
  cursor: Guardian.string().minLength(1).optional(),
}).describe({
  title: 'List issue events request',
  description:
    'Filter/pagination options accepted by Sentry.listIssueEvents(), validated before the API call.',
});

/** Guardian schema that validates a {@link ListIssueEventsRequestSchema}. */
export const ListIssueEventsRequestSchemaObject: BaseGuardian<
  ListIssueEventsRequestSchema
> = _listIssueEventsRequestSchema;

/**
 * Schema for the paginated
 * `GET /organizations/{org}/issues/{issue_id}/events/` response — Sentry
 * returns a bare JSON array, so this wraps it under `events` alongside a
 * convenience `nextCursor` (see {@link ListProjectsResponseSchemaObject} for
 * why it's threaded in by the client rather than derived here via
 * `.transform()`).
 *
 * @example
 * ```typescript
 * import { ListIssueEventsResponseSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * const [error, page] = ListIssueEventsResponseSchemaObject.safeParse({ events: [] });
 * if (!error) {
 *   console.log('Events on this page:', page.events.length);
 * }
 * ```
 */
export type ListIssueEventsResponseSchema = {
  events: IssueEventSchema[];
  /** Sentry's next-page cursor, extracted from the `Link` response header. `undefined` on the last page. */
  nextCursor?: string;
};

const _listIssueEventsResponseSchema: BaseGuardian<
  ListIssueEventsResponseSchema
> = Guardian.object({
  /** The page of Event resources. */
  events: Guardian.array(IssueEventSchemaObject),
  /** Sentry's next-page cursor, extracted from the `Link` response header. */
  nextCursor: Guardian.string().optional(),
}).describe({
  title: 'List issue events response',
  description:
    "A paginated page of an issue's Event resources, with a convenience nextCursor.",
});

/** Guardian schema that validates a {@link ListIssueEventsResponseSchema}. */
export const ListIssueEventsResponseSchemaObject: BaseGuardian<
  ListIssueEventsResponseSchema
> = _listIssueEventsResponseSchema;
