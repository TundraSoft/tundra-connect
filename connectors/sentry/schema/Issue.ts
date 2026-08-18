import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';
import {
  type IssueProjectRefSchema,
  IssueProjectRefSchemaObject,
  PRIORITIES,
} from './Common.ts';

/**
 * Schema for a Sentry Issue resource, as returned by
 * {@link Sentry.listIssues}, {@link Sentry.getIssue}, and
 * {@link Sentry.updateIssue}
 * (https://docs.sentry.io/api/events/list-an-organizations-issues/,
 * https://docs.sentry.io/api/events/retrieve-an-issue/).
 *
 * Models the commonly-present fields; Sentry's full Issue resource carries
 * many more (activity logs, participants, 24h/30d stat buckets, ...) that
 * vary by endpoint and plan, so the schema `.passthrough()`es rather than
 * exhaustively modelling every one of them. `count` is intentionally typed
 * `string` — Sentry returns it as a numeric string (e.g. `"1"`), not a
 * number, in every documented example.
 *
 * @example
 * ```typescript
 * import { IssueSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * const [error, issue] = IssueSchemaObject.safeParse({
 *   id: '1',
 *   shortId: 'PUMP-STATION-1',
 *   title: 'This is an example Python exception',
 *   culprit: 'raven.scripts.runner in main',
 *   level: 'error',
 *   status: 'unresolved',
 *   isPublic: false,
 *   type: 'default',
 *   numComments: 0,
 *   isBookmarked: false,
 *   count: '1',
 *   userCount: 0,
 *   firstSeen: '2018-11-06T21:19:55Z',
 *   lastSeen: '2018-11-06T21:19:55Z',
 *   project: { id: '2', name: 'Pump Station', slug: 'pump-station' },
 * });
 * if (!error) {
 *   console.log(issue.shortId, issue.status);
 * }
 * ```
 */
type _IssueShape = {
  id: string;
  shortId: string;
  title: string;
  culprit?: string | null;
  permalink?: string | null;
  level: string;
  status: string;
  substatus?: string | null;
  isPublic: boolean;
  platform?: string | null;
  priority?: (typeof PRIORITIES)[number] | null;
  project: IssueProjectRefSchema;
  type: string;
  issueType?: string;
  issueCategory?: string;
  numComments: number;
  assignedTo?: unknown;
  isBookmarked: boolean;
  isSubscribed?: boolean;
  hasSeen?: boolean;
  /** Total event count for this issue, as a numeric string (e.g. `"1"`). */
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  firstRelease?: unknown;
  lastRelease?: unknown;
  tags?: unknown[];
};

const _issueSchema: BaseGuardian<_IssueShape> = Guardian.object({
  /** Issue ID. */
  id: Guardian.string(),
  /** Short, human-friendly issue identifier (e.g. `PUMP-STATION-1`). */
  shortId: Guardian.string(),
  /** Issue title. */
  title: Guardian.string(),
  /** Where the issue originated (e.g. a function/module name). */
  culprit: Guardian.string().nullable().optional(),
  /** Web URL for viewing this issue in Sentry. */
  permalink: Guardian.string().nullable().optional(),
  /** Event level (e.g. `error`, `warning`). */
  level: Guardian.string(),
  /** Issue status (e.g. `unresolved`, `resolved`, `ignored`). */
  status: Guardian.string(),
  /** Finer-grained status detail (e.g. `ongoing`, `regressed`). */
  substatus: Guardian.string().nullable().optional(),
  /** Whether a public share link has been created for this issue. */
  isPublic: Guardian.boolean(),
  /** Platform identifier (e.g. `python`), when known. */
  platform: Guardian.string().nullable().optional(),
  /** Issue priority. */
  priority: Guardian.enum(PRIORITIES).nullable().optional(),
  /** The project this issue belongs to. */
  project: IssueProjectRefSchemaObject,
  /** Issue type (e.g. `default`, `error`). */
  type: Guardian.string(),
  /** Fine-grained issue type (e.g. `error.unhandled`). */
  issueType: Guardian.string().optional(),
  /** Issue category (e.g. `error`, `performance`). */
  issueCategory: Guardian.string().optional(),
  /** Number of comments on this issue. */
  numComments: Guardian.number().integer(),
  /** The user or team assigned to this issue; `null`/absent if unassigned. */
  assignedTo: Guardian.unknown().optional(),
  /** Whether the requesting user has bookmarked this issue. */
  isBookmarked: Guardian.boolean(),
  /** Whether the requesting user is subscribed to this issue. */
  isSubscribed: Guardian.boolean().optional(),
  /** Whether the requesting user has seen this issue. */
  hasSeen: Guardian.boolean().optional(),
  /** Total event count for this issue, as a numeric string (e.g. `"1"`). */
  count: Guardian.string(),
  /** Number of distinct users affected. */
  userCount: Guardian.number().integer(),
  /** ISO 8601 timestamp of the first event. */
  firstSeen: Guardian.string(),
  /** ISO 8601 timestamp of the most recent event. */
  lastSeen: Guardian.string(),
  /** The release this issue was first seen in, when known. */
  firstRelease: Guardian.unknown().optional(),
  /** The release this issue was last seen in, when known. */
  lastRelease: Guardian.unknown().optional(),
  /** Aggregated tag summaries for this issue (browser, OS, environment, ...). */
  tags: Guardian.array(Guardian.unknown()).optional(),
}).passthrough().describe({
  title: 'Issue resource',
  description:
    'A Sentry Issue resource, as returned by the issues list/detail/update endpoints.',
});

/** Type definition for {@link IssueSchemaObject}. */
export type IssueSchema = GuardianInfer<typeof _issueSchema>;

export const IssueSchemaObject: BaseGuardian<IssueSchema> = _issueSchema;
