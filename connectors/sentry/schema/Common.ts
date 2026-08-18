import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';

/**
 * Reusable Guardian validation components shared by the Sentry request and
 * response schemas — see https://docs.sentry.io/api/.
 *
 * @example
 * ```typescript
 * import { PRIORITIES } from '@tundraconnect/sentry/schemas';
 *
 * console.log(PRIORITIES); // ['low', 'medium', 'high']
 * ```
 */

/** Issue priority levels, as documented for the Update an Issue endpoint. */
export const PRIORITIES = ['low', 'medium', 'high'] as const;

/**
 * Issue `status` values accepted by the Update an Issue endpoint
 * (https://docs.sentry.io/api/events/update-an-issue/). `muted` is a
 * deprecated alias for `ignored`, still documented as accepted.
 */
export const ISSUE_STATUSES = [
  'resolved',
  'unresolved',
  'ignored',
  'resolvedInNextRelease',
  'muted',
] as const;

/**
 * Issue `substatus` values accepted by the Update an Issue endpoint
 * (https://docs.sentry.io/api/events/update-an-issue/).
 */
export const ISSUE_SUBSTATUSES = [
  'archived_until_escalating',
  'archived_until_condition_met',
  'archived_forever',
  'escalating',
  'ongoing',
  'regressed',
  'new',
] as const;

/**
 * `sort` values accepted by List an Organization's Issues
 * (https://docs.sentry.io/api/events/list-an-organizations-issues/).
 */
export const ISSUE_SORT_OPTIONS = [
  'date',
  'freq',
  'inbox',
  'new',
  'recommended',
  'trends',
  'user',
] as const;

/**
 * Schema for the small Project reference embedded in an Issue's `project`
 * field — not the full Project resource returned by
 * {@link Sentry.listProjects} (see `./Project.ts`).
 *
 * @example
 * ```typescript
 * import { IssueProjectRefSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * const [error, project] = IssueProjectRefSchemaObject.safeParse({
 *   id: '2',
 *   name: 'Pump Station',
 *   slug: 'pump-station',
 * });
 * ```
 */
type _IssueProjectRefShape = {
  id: string;
  name: string;
  slug: string;
  platform?: string | null;
};

const _issueProjectRefSchema: BaseGuardian<_IssueProjectRefShape> = Guardian
  .object({
    /** Project ID. */
    id: Guardian.string(),
    /** Project display name. */
    name: Guardian.string(),
    /** Project slug. */
    slug: Guardian.string(),
    /** Project platform identifier (e.g. `python`), when set. */
    platform: Guardian.string().nullable().optional(),
  }).passthrough().describe({
    title: 'Issue project reference',
    description:
      "The small project reference embedded in an Issue's `project` field.",
  });

/** Type definition for {@link IssueProjectRefSchemaObject}. */
export type IssueProjectRefSchema = GuardianInfer<
  typeof _issueProjectRefSchema
>;

export const IssueProjectRefSchemaObject: BaseGuardian<IssueProjectRefSchema> =
  _issueProjectRefSchema;
