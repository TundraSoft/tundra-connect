import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';

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
type _DeleteObjectResponseShape = {
  versionId?: string;
  deleteMarker?: boolean;
};

const _deleteObjectResponseSchema: BaseGuardian<_DeleteObjectResponseShape> =
  Guardian.object({
    /** Value of the `x-amz-version-id` response header, when versioning is enabled. */
    versionId: Guardian.string().optional(),
    /** Value of the `x-amz-delete-marker` response header — `true` when the delete created a delete marker rather than removing a version outright. */
    deleteMarker: Guardian.boolean().optional(),
  }).describe({
    title: 'DeleteObject result',
    description: 'Header-derived result of a successful DeleteObject request.',
  });

/** Type definition for {@link DeleteObjectResponseSchemaObject}. */
export type DeleteObjectResponseSchema = GuardianInfer<
  typeof _deleteObjectResponseSchema
>;

export const DeleteObjectResponseSchemaObject: BaseGuardian<
  DeleteObjectResponseSchema
> = _deleteObjectResponseSchema;
