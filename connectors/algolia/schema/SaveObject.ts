import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for a {@link Algolia.saveObject} response body.
 *
 * Hand-written (rather than derived via `GuardianInfer`) so the exported
 * schema below can carry an explicit
 * `BaseGuardian<SaveObjectResponseSchema>` annotation with no unannotated
 * intermediate — JSR's "slow types" check requires the originating
 * declaration of any type reachable from the public API to be explicit.
 */
export type SaveObjectResponseSchema = {
  /** Algolia-assigned (or caller-supplied) id of the saved record. */
  objectID: string;
  /** Id of the asynchronous indexing task — pass to {@link Algolia.waitTask}. */
  taskID: number;
  /** ISO 8601 timestamp the record was created. */
  createdAt: string;
};

/**
 * Schema for a {@link Algolia.saveObject} response body.
 *
 * Saving an object is asynchronous on Algolia's side — the response
 * confirms the write was accepted and queued, not that it is live yet; poll
 * {@link Algolia.waitTask} with the returned `taskID` to know when the
 * index actually reflects it.
 *
 * @example
 * ```typescript
 * import { SaveObjectResponseSchemaObject } from '@tundraconnect/algolia/schemas';
 *
 * const [error, response] = SaveObjectResponseSchemaObject.safeParse({
 *   objectID: 'abc123',
 *   taskID: 42,
 *   createdAt: '2024-01-01T00:00:00.000Z',
 * });
 * ```
 */
export const SaveObjectResponseSchemaObject: BaseGuardian<
  SaveObjectResponseSchema
> = Guardian.object({
  /** Algolia-assigned (or caller-supplied) id of the saved record. */
  objectID: Guardian.string(),
  /** Id of the asynchronous indexing task — pass to {@link Algolia.waitTask}. */
  taskID: Guardian.number().integer(),
  /** ISO 8601 timestamp the record was created. */
  createdAt: Guardian.string(),
}).passthrough().describe({
  title: 'Algolia save-object response',
  description: 'Response body for `POST /1/indexes/{indexName}`.',
});
