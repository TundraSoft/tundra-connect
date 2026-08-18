import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Normalized shape of a single List Blobs entry.
 *
 * This is the connect's own camelCase shape (`name`/`lastModified`/`etag`/
 * `contentLength`/`contentType`) — not the raw `<Blob><Properties>...`
 * nesting Azure's XML uses. `ListBlobsResponseSchemaObject` (in
 * `schema/response/`) is responsible for flattening the vendor XML into
 * this shape before it reaches this schema.
 *
 * Written out by hand (rather than derived via `GuardianInfer<typeof
 * BlobItemSchemaObject>`) so `BlobItemSchemaObject` below can carry an
 * explicit `BaseGuardian<BlobItemSchema>` annotation without a circular
 * reference — see `CONVENTIONS.md`'s JSR "slow types" note.
 */
export type BlobItemSchema = {
  /** Blob name (the "key"), including any virtual `/`-delimited path. */
  name: string;
  /** Last time the blob's content or metadata was modified. */
  lastModified: Date;
  /** Entity tag for the blob's current content. */
  etag: string;
  /** Content length in bytes. */
  contentLength: number;
  /** MIME type set on the blob, when specified. */
  contentType?: string;
};

/**
 * Schema for a single normalized entry from a List Blobs response.
 *
 * @example
 * ```typescript
 * import { BlobItemSchemaObject } from '@tundraconnect/azure-blob/schemas';
 *
 * const [error, item] = BlobItemSchemaObject.safeParse({
 *   name: 'photos/cat.png',
 *   lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
 *   etag: '"0x8D1234567890ABC"',
 *   contentLength: '12345',
 *   contentType: 'image/png',
 * });
 * if (!error) {
 *   console.log(item.lastModified instanceof Date); // true — coerced
 * }
 * ```
 */
export const BlobItemSchemaObject: BaseGuardian<BlobItemSchema> = Guardian
  .object({
    /** Blob name (the "key"), including any virtual `/`-delimited path. */
    name: Guardian.string(),
    /** Last time the blob's content or metadata was modified. */
    lastModified: Guardian.date(),
    /** Entity tag for the blob's current content. */
    etag: Guardian.string(),
    /** Content length in bytes. */
    contentLength: Guardian.number(),
    /** MIME type set on the blob, when specified. */
    contentType: Guardian.string().optional(),
  }).describe({
    title: 'Azure Blob Storage list item',
    description: 'One normalized <Blob> entry from a List Blobs response.',
  });
