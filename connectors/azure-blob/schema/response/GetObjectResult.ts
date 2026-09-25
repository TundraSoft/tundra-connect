import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Shape of a Get Blob response — the binary body plus its header-derived
 * properties (`Content-Type`, `Content-Length`, `ETag`, `Last-Modified`,
 * and any `x-ms-meta-*` user metadata).
 *
 * `body` is validated with `Guardian.instanceof(Blob)` since `AzureBlob`
 * requests the body via `responseType: 'BLOB'`, which RESTler reads as a
 * real `Blob` instance (a standard Web API, available on every supported
 * runtime).
 *
 * Written out by hand (rather than derived via `GuardianInfer<typeof
 * GetObjectResultSchemaObject>`) so `GetObjectResultSchemaObject` below
 * can carry an explicit `BaseGuardian<GetObjectResultSchema>` annotation
 * without a circular reference — see `CONVENTIONS.md`'s JSR "slow types"
 * note.
 */
export type GetObjectResultSchema = {
  /** Blob content. */
  body: Blob;
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
 * Schema for a Get Blob response — the binary body plus its header-derived
 * properties.
 *
 * @example
 * ```typescript
 * import { GetObjectResultSchemaObject } from '@tundraconnect/azure-blob/schemas';
 *
 * declare const body: Blob;
 * const [error, result] = GetObjectResultSchemaObject.safeParse({
 *   body,
 *   contentType: 'text/plain',
 *   contentLength: '11',
 *   etag: '"0x8D1234567890ABC"',
 *   lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
 *   metadata: {},
 * });
 * ```
 */
export const GetObjectResultSchemaObject: BaseGuardian<GetObjectResultSchema> =
  Guardian.object({
    /** Blob content. */
    body: Guardian.instanceof(Blob),
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
    title: 'Azure Blob Storage Get Blob result',
    description: 'Blob content plus header-derived properties.',
  });
