import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Shape of a Get Blob Properties (head) response — the same header-derived
 * properties as {@link GetObjectResultSchema}, minus the body.
 *
 * Written out by hand (rather than derived via `GuardianInfer<typeof
 * HeadObjectResultSchemaObject>`) so `HeadObjectResultSchemaObject` below
 * can carry an explicit `BaseGuardian<HeadObjectResultSchema>` annotation
 * without a circular reference — see `CONVENTIONS.md`'s JSR "slow types"
 * note.
 */
export type HeadObjectResultSchema = {
  /** MIME type of the blob's content, when set. */
  contentType?: string;
  /** Content length in bytes, when present on the response. */
  contentLength?: number;
  /** Entity tag for the blob's current content. */
  etag: string;
  /** Last time the blob's content or metadata was modified. */
  lastModified: Date;
  /** User-defined metadata, flattened from `x-ms-meta-*` headers. */
  metadata: Record<string, string>;
};

/**
 * Schema for a Get Blob Properties (head) response — the same
 * header-derived properties as {@link GetObjectResultSchemaObject}, minus
 * the body.
 *
 * @example
 * ```typescript
 * import { HeadObjectResultSchemaObject } from '@tundraconnect/azure-blob/schemas';
 *
 * const [error, result] = HeadObjectResultSchemaObject.safeParse({
 *   contentType: 'text/plain',
 *   contentLength: '11',
 *   etag: '"0x8D1234567890ABC"',
 *   lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
 *   metadata: {},
 * });
 * ```
 */
export const HeadObjectResultSchemaObject: BaseGuardian<
  HeadObjectResultSchema
> = Guardian.object({
  /** MIME type of the blob's content, when set. */
  contentType: Guardian.string().optional(),
  /** Content length in bytes, when present on the response. */
  contentLength: Guardian.number().optional(),
  /** Entity tag for the blob's current content. */
  etag: Guardian.string(),
  /** Last time the blob's content or metadata was modified. */
  lastModified: Guardian.date(),
  /** User-defined metadata, flattened from `x-ms-meta-*` headers. */
  metadata: Guardian.record(Guardian.string()),
}).describe({
  title: 'Azure Blob Storage Get Blob Properties result',
  description:
    'Header-derived properties of a Get Blob Properties (head) response.',
});
