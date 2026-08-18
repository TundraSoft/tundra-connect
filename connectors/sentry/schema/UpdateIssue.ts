import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';
import { ISSUE_STATUSES, ISSUE_SUBSTATUSES, PRIORITIES } from './Common.ts';

/**
 * Schema for {@link Sentry.updateIssue} request options — body fields
 * accepted by `PUT /organizations/{org}/issues/{issue_id}/`
 * (https://docs.sentry.io/api/events/update-an-issue/). At least one field
 * is required; an empty object is rejected locally rather than sent as a
 * no-op request.
 *
 * @example
 * ```typescript
 * import { UpdateIssueRequestSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * const [error, options] = UpdateIssueRequestSchemaObject.safeParse({
 *   status: 'resolved',
 * });
 * ```
 */
type _UpdateIssueRequestShape = {
  status?: (typeof ISSUE_STATUSES)[number];
  substatus?: (typeof ISSUE_SUBSTATUSES)[number];
  statusDetails?: Record<string, unknown>;
  priority?: (typeof PRIORITIES)[number];
  assignedTo?: string;
  inbox?: boolean;
  hasSeen?: boolean;
  isBookmarked?: boolean;
  isSubscribed?: boolean;
  isPublic?: boolean;
  merge?: boolean;
  discard?: boolean;
};

const _updateIssueRequestSchema: BaseGuardian<_UpdateIssueRequestShape> =
  Guardian
    .object({
      /** New issue status. */
      status: Guardian.enum(ISSUE_STATUSES).optional(),
      /** New finer-grained status detail; only meaningful alongside a compatible `status`. */
      substatus: Guardian.enum(ISSUE_SUBSTATUSES).optional(),
      /** Additional resolution details (release data), for single-project issues only. */
      statusDetails: Guardian.record(Guardian.unknown()).optional(),
      /** New issue priority. */
      priority: Guardian.enum(PRIORITIES).optional(),
      /** `<user_id>`, `user:<user_id>`, `<username>`, `<user_primary_email>`, or `team:<team_id>`. */
      assignedTo: Guardian.string().minLength(1).optional(),
      /** Marks the issue as reviewed (removed from the Inbox). */
      inbox: Guardian.boolean().optional(),
      /** Marks the issue as seen by the requesting user. */
      hasSeen: Guardian.boolean().optional(),
      /** Bookmarks (or un-bookmarks) the issue. */
      isBookmarked: Guardian.boolean().optional(),
      /** Subscribes (or unsubscribes) the requesting user to the issue. */
      isSubscribed: Guardian.boolean().optional(),
      /** Publishes (or un-publishes) a public share link for the issue. */
      isPublic: Guardian.boolean().optional(),
      /** Merges this issue with other issues (requires additional issue IDs, handled server-side). */
      merge: Guardian.boolean().optional(),
      /** Discards the issue instead of updating it. */
      discard: Guardian.boolean().optional(),
    }).refine(
      (value) => Object.values(value).some((v) => v !== undefined),
      'At least one field must be supplied to update an issue',
    ).describe({
      title: 'Update issue request',
      description:
        'Body fields accepted by Sentry.updateIssue(), validated before the API call.',
    });

/** Type definition for {@link Sentry.updateIssue} request options. */
export type UpdateIssueRequestSchema = GuardianInfer<
  typeof _updateIssueRequestSchema
>;

export const UpdateIssueRequestSchemaObject: BaseGuardian<
  UpdateIssueRequestSchema
> = _updateIssueRequestSchema;
