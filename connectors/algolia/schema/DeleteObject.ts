import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for a {@link Algolia.deleteObject} response body.
 *
 * Hand-written (rather than derived via `GuardianInfer`) so the exported
 * schema below can carry an explicit
 * `BaseGuardian<DeleteObjectResponseSchema>` annotation with no unannotated
 * intermediate — JSR's "slow types" check requires the originating
 * declaration of any type reachable from the public API to be explicit.
 */
export type DeleteObjectResponseSchema = {
  /** ISO 8601 timestamp the deletion was accepted. */
  deletedAt: string;
  /** Id of the asynchronous indexing task — pass to {@link Algolia.waitTask}. */
  taskID: number;
};

/**
 * Schema for a {@link Algolia.deleteObject} response body.
 *
 * Like a save, a delete is queued asynchronously — `taskID` can be passed
 * to {@link Algolia.waitTask} to confirm the deletion is live.
 *
 * @example
 * ```typescript
 * import { DeleteObjectResponseSchemaObject } from '@tundraconnect/algolia/schemas';
 *
 * const [error, response] = DeleteObjectResponseSchemaObject.safeParse({
 *   deletedAt: '2024-01-01T00:00:00.000Z',
 *   taskID: 43,
 * });
 * ```
 */
export const DeleteObjectResponseSchemaObject: BaseGuardian<
  DeleteObjectResponseSchema
> = Guardian.object({
  /** ISO 8601 timestamp the deletion was accepted. */
  deletedAt: Guardian.string(),
  /** Id of the asynchronous indexing task — pass to {@link Algolia.waitTask}. */
  taskID: Guardian.number().integer(),
}).passthrough().describe({
  title: 'Algolia delete-object response',
  description: 'Response body for `DELETE /1/indexes/{indexName}/{objectID}`.',
});
