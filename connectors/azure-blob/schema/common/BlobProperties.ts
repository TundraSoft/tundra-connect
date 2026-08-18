import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Header-derived properties common to a Get Blob and Get Blob Properties
 * (head) response.
 *
 * Azure returns these as HTTP response headers, not a body — `AzureBlob`
 * assembles a plain object from `RESTlerResponse.headers` (including
 * flattening every `x-ms-meta-*` header into `metadata`) and validates it
 * against this schema before returning it to the caller.
 *
 * Written out by hand (rather than derived via `GuardianInfer<typeof
 * BlobPropertiesSchemaObject>`) so `BlobPropertiesSchemaObject` below can
 * carry an explicit `BaseGuardian<BlobPropertiesSchema>` annotation
 * without a circular reference — see `CONVENTIONS.md`'s JSR "slow types"
 * note.
 */
export type BlobPropertiesSchema = {
  /** Entity tag for the blob's current content. */
  etag: string;
  /** Last time the blob's content or metadata was modified. */
  lastModified: Date;
  /** MIME type of the blob's content, when set. */
  contentType?: string;
  /** Content length in bytes, when present on the response. */
  contentLength?: number;
  /** User-defined metadata, flattened from `x-ms-meta-*` headers. */
  metadata: Record<string, string>;
};

/**
 * Schema for the header-derived properties common to a Get Blob and Get
 * Blob Properties (head) response.
 *
 * @example
 * ```typescript
 * import { BlobPropertiesSchemaObject } from '@tundraconnect/azure-blob/schemas';
 *
 * const [error, props] = BlobPropertiesSchemaObject.safeParse({
 *   etag: '"0x8D1234567890ABC"',
 *   lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
 *   contentType: 'text/plain',
 *   contentLength: '11',
 *   metadata: { author: 'ada' },
 * });
 * ```
 */
export const BlobPropertiesSchemaObject: BaseGuardian<BlobPropertiesSchema> =
  Guardian.object({
    /** Entity tag for the blob's current content. */
    etag: Guardian.string(),
    /** Last time the blob's content or metadata was modified. */
    lastModified: Guardian.date(),
    /** MIME type of the blob's content, when set. */
    contentType: Guardian.string().optional(),
    /** Content length in bytes, when present on the response. */
    contentLength: Guardian.number().optional(),
    /** User-defined metadata, flattened from `x-ms-meta-*` headers. */
    metadata: Guardian.record(Guardian.string()),
  }).describe({
    title: 'Azure Blob Storage blob properties',
    description:
      'Header-derived properties shared by Get Blob and Get Blob Properties responses.',
  });
