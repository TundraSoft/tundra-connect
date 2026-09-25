import { type BaseGuardian, Guardian } from '@guardian';
import { etagGuard } from './Common.ts';

/**
 * Schema for a CreateMultipartUpload (`<InitiateMultipartUploadResult>`)
 * response — the unwrapped root element, as RESTler's XML parser emits it.
 * Only `UploadId` is load-bearing; `Bucket`/`Key` echo the request.
 *
 * @example
 * ```typescript
 * const [error, result] = InitiateMultipartUploadResultSchemaObject.safeParse({
 *   Bucket: 'my-bucket',
 *   Key: 'big.bin',
 *   UploadId: 'VXBsb2FkIElEIGZvciA2aWWpbmcncyBteS1tb3ZpZS5tMnRzIHVwbG9hZA',
 * });
 * ```
 */
export type InitiateMultipartUploadResultSchema = {
  bucket: string;
  key: string;
  uploadId: string;
};

const _initiateMultipartUploadResultSchema: BaseGuardian<
  InitiateMultipartUploadResultSchema
> = Guardian.object({
  Bucket: Guardian.string(),
  Key: Guardian.string(),
  UploadId: Guardian.string().minLength(1),
}).transform((result) => ({
  bucket: result.Bucket,
  key: result.Key,
  uploadId: result.UploadId,
})).describe({
  title: 'CreateMultipartUpload result',
  description:
    'Parsed `<InitiateMultipartUploadResult>` document from a CreateMultipartUpload request.',
});

/** Guardian schema that validates a {@link InitiateMultipartUploadResultSchema}. */
export const InitiateMultipartUploadResultSchemaObject: BaseGuardian<
  InitiateMultipartUploadResultSchema
> = _initiateMultipartUploadResultSchema;

/**
 * Schema for a CompleteMultipartUpload (`<CompleteMultipartUploadResult>`)
 * response. `ETag` is the assembled object's entity tag — for a multipart
 * object it is *not* an MD5 of the content (it carries a `-N` part-count
 * suffix), so it is validated only as an opaque string like every other
 * ETag in this connect.
 *
 * @example
 * ```typescript
 * const [error, result] = CompleteMultipartUploadResultSchemaObject.safeParse({
 *   Location: 'https://my-bucket.s3.us-east-1.amazonaws.com/big.bin',
 *   Bucket: 'my-bucket',
 *   Key: 'big.bin',
 *   ETag: '"3858f62230ac3c915f300c664312c11f-9"',
 * });
 * ```
 */
export type CompleteMultipartUploadResultSchema = {
  location?: string;
  bucket: string;
  key: string;
  etag: string;
};

const _completeMultipartUploadResultSchema: BaseGuardian<
  CompleteMultipartUploadResultSchema
> = Guardian.object({
  Location: Guardian.string().optional(),
  Bucket: Guardian.string(),
  Key: Guardian.string(),
  ETag: etagGuard,
}).transform((result) => ({
  location: result.Location,
  bucket: result.Bucket,
  key: result.Key,
  etag: result.ETag,
})).describe({
  title: 'CompleteMultipartUpload result',
  description:
    'Parsed `<CompleteMultipartUploadResult>` document from a CompleteMultipartUpload request.',
});

/** Guardian schema that validates a {@link CompleteMultipartUploadResultSchema}. */
export const CompleteMultipartUploadResultSchemaObject: BaseGuardian<
  CompleteMultipartUploadResultSchema
> = _completeMultipartUploadResultSchema;
