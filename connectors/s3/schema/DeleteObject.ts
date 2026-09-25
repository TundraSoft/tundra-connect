import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Schema for a DeleteObject result
 *
 * S3 responds `204 No Content` on a successful delete — there is no
 * response body to validate. The only signal is a pair of optional
 * headers, present when the bucket has versioning enabled.
 *
 * @example
 * ```typescript
 * const [error, result] = DeleteObjectResponseSchemaObject.safeParse({
 *   deleteMarker: true,
 * });
 * ```
 */
export type DeleteObjectResponseSchema = {
  versionId?: string;
  deleteMarker?: boolean;
};

const _deleteObjectResponseSchema: BaseGuardian<DeleteObjectResponseSchema> =
  Guardian.object({
    /** Value of the `x-amz-version-id` response header, when versioning is enabled. */
    versionId: Guardian.string().optional(),
    /** Value of the `x-amz-delete-marker` response header — `true` when the delete created a delete marker rather than removing a version outright. */
    deleteMarker: Guardian.boolean().optional(),
  }).describe({
    title: 'DeleteObject result',
    description: 'Header-derived result of a successful DeleteObject request.',
  });

/** Guardian schema that validates a {@link DeleteObjectResponseSchema}. */
export const DeleteObjectResponseSchemaObject: BaseGuardian<
  DeleteObjectResponseSchema
> = _deleteObjectResponseSchema;
