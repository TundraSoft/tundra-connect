import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';
import { etagGuard } from './Common.ts';

/**
 * Schema for a PutObject result
 *
 * S3 sets no response body on a successful `PUT` — the result is built
 * entirely from the `ETag` and (when versioning is enabled)
 * `x-amz-version-id` response headers.
 *
 * @example
 * ```typescript
 * const [error, result] = PutObjectResponseSchemaObject.safeParse({
 *   etag: '"9a0364b9e99bb480dd25e1f0284c8555"',
 * });
 * ```
 */
type _PutObjectResponseShape = {
  etag: string;
  versionId?: string;
};

const _putObjectResponseSchema: BaseGuardian<_PutObjectResponseShape> = Guardian
  .object({
    /** Value of the `ETag` response header. */
    etag: etagGuard,
    /** Value of the `x-amz-version-id` response header, when versioning is enabled. */
    versionId: Guardian.string().optional(),
  }).describe({
    title: 'PutObject result',
    description: 'Header-derived result of a successful PutObject request.',
  });

/** Type definition for {@link PutObjectResponseSchemaObject}. */
export type PutObjectResponseSchema = GuardianInfer<
  typeof _putObjectResponseSchema
>;

export const PutObjectResponseSchemaObject: BaseGuardian<
  PutObjectResponseSchema
> = _putObjectResponseSchema;
