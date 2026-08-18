import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';

/**
 * Schema for a Sentry Event resource, as returned by
 * {@link Sentry.listIssueEvents}
 * (https://docs.sentry.io/api/events/list-an-issues-events/).
 *
 * Models the commonly-present fields; an event's full body (stacktrace,
 * breadcrumbs, request/user context, ...) is deep, vendor-evolving, and
 * only fully populated when the request is made with `full: true`, so the
 * schema `.passthrough()`es rather than exhaustively modelling every one of
 * them.
 *
 * @example
 * ```typescript
 * import { IssueEventSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * const [error, event] = IssueEventSchemaObject.safeParse({
 *   id: 'abc123',
 *   eventID: 'abc123',
 *   groupID: '1',
 *   projectID: '2',
 *   dateCreated: '2018-11-06T21:19:55Z',
 * });
 * ```
 */
type _IssueEventShape = {
  id: string;
  eventID?: string;
  groupID?: string;
  projectID?: string;
  title?: string;
  message?: string;
  platform?: string;
  dateCreated: string;
  culprit?: string | null;
  tags?: unknown[];
  user?: unknown;
};

const _issueEventSchema: BaseGuardian<_IssueEventShape> = Guardian.object({
  /** Event ID. */
  id: Guardian.string(),
  /** Alias of `id`, as documented for this endpoint. */
  eventID: Guardian.string().optional(),
  /** ID of the issue (group) this event belongs to. */
  groupID: Guardian.string().optional(),
  /** ID of the project this event belongs to. */
  projectID: Guardian.string().optional(),
  /** Event title. */
  title: Guardian.string().optional(),
  /** Event message. */
  message: Guardian.string().optional(),
  /** Platform identifier (e.g. `python`), when known. */
  platform: Guardian.string().optional(),
  /** ISO 8601 timestamp the event was received. */
  dateCreated: Guardian.string(),
  /** Where the event originated (e.g. a function/module name). */
  culprit: Guardian.string().nullable().optional(),
  /** Tag key/value pairs recorded on this event. */
  tags: Guardian.array(Guardian.unknown()).optional(),
  /** The user context attached to this event, when present. */
  user: Guardian.unknown().optional(),
}).passthrough().describe({
  title: 'Issue event resource',
  description:
    "A Sentry Event resource, as returned by an issue's events list.",
});

/** Type definition for {@link IssueEventSchemaObject}. */
export type IssueEventSchema = GuardianInfer<typeof _issueEventSchema>;

export const IssueEventSchemaObject: BaseGuardian<IssueEventSchema> =
  _issueEventSchema;
