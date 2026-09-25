import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for a {@link Algolia.waitTask} poll response body.
 *
 * Hand-written (rather than derived via `GuardianInfer`) so the exported
 * schema below can carry an explicit `BaseGuardian<TaskStatusSchema>`
 * annotation with no unannotated intermediate — JSR's "slow types" check
 * requires the originating declaration of any type reachable from the
 * public API to be explicit.
 */
export type TaskStatusSchema = {
  /** `'published'` once the task has been applied to the index; `'notPublished'` while still processing. */
  status: 'published' | 'notPublished';
};

/**
 * Schema for a {@link Algolia.waitTask} poll response body
 * (`GET /1/indexes/{indexName}/task/{taskID}`).
 *
 * @example
 * ```typescript
 * import { TaskStatusSchemaObject } from '@tundraconnect/algolia/schemas';
 *
 * const [error, status] = TaskStatusSchemaObject.safeParse({ status: 'published' });
 * ```
 */
export const TaskStatusSchemaObject: BaseGuardian<TaskStatusSchema> = Guardian
  .object({
    /** `'published'` once the task has been applied to the index; `'notPublished'` while still processing. */
    status: Guardian.enum(['published', 'notPublished'] as const),
  }).passthrough().describe({
    title: 'Algolia task status',
    description:
      'Response body for `GET /1/indexes/{indexName}/task/{taskID}`.',
  });
