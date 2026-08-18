import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Shape of a Put Blob response — Azure returns `201 Created` with the new
 * blob's `ETag`/`Last-Modified` as headers, no body.
 *
 * Written out by hand (rather than derived via `GuardianInfer<typeof
 * PutObjectResultSchemaObject>`) so `PutObjectResultSchemaObject` below
 * can carry an explicit `BaseGuardian<PutObjectResultSchema>` annotation
 * without a circular reference — see `CONVENTIONS.md`'s JSR "slow types"
 * note.
 */
export type PutObjectResultSchema = {
  /** Entity tag for the newly-written blob content. */
  etag: string;
  /** Time the blob was written. */
  lastModified: Date;
};

/**
 * Schema for a Put Blob response — Azure returns `201 Created` with the
 * new blob's `ETag`/`Last-Modified` as headers, no body.
 *
 * @example
 * ```typescript
 * import { PutObjectResultSchemaObject } from '@tundraconnect/azure-blob/schemas';
 *
 * const [error, result] = PutObjectResultSchemaObject.safeParse({
 *   etag: '"0x8D1234567890ABC"',
 *   lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
 * });
 * ```
 */
export const PutObjectResultSchemaObject: BaseGuardian<PutObjectResultSchema> =
  Guardian.object({
    /** Entity tag for the newly-written blob content. */
    etag: Guardian.string(),
    /** Time the blob was written. */
    lastModified: Guardian.date(),
  }).describe({
    title: 'Azure Blob Storage Put Blob result',
    description: 'Header-derived result of a successful Put Blob operation.',
  });
