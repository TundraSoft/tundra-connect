/**
 * Typed, cross-runtime client for the
 * [Google Cloud Storage JSON
 * API](https://cloud.google.com/storage/docs/json_api/v1).
 *
 * Typed Google Cloud Storage client with bearer or service-account auth:
 * upload, download, list, inspect and delete objects, including resumable
 * streamed uploads for large files.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`GCSError` and its code registry).
 *
 * @example
 * ```ts
 * import { GCS } from '@tundraconnect/gcs';
 *
 * const client = new GCS({
 *   auth: { type: 'BEARER', token: 'ya29....' },
 * });
 *
 * await client.putObject({
 *   bucket: 'my-bucket',
 *   key: 'reports/2024-01.csv',
 *   body: new TextEncoder().encode('a,b,c\n1,2,3\n'),
 *   contentType: 'text/csv',
 * });
 *
 * const { body, metadata } = await client.getObject({
 *   bucket: 'my-bucket',
 *   key: 'reports/2024-01.csv',
 * });
 * console.log(metadata.size, await body.text());
 *
 * const { objects } = await client.listObjects({
 *   bucket: 'my-bucket',
 *   prefix: 'reports/',
 * });
 * for (const object of objects) console.log(object.name);
 *
 * await client.deleteObject({ bucket: 'my-bucket', key: 'reports/2024-01.csv' });
 * ```
 *
 * @module
 */

export {
  DEFAULT_CHUNK_SIZE,
  type DeleteObjectOptions,
  GCS,
  type GCSAuth,
  type GCSBearerAuth,
  type GCSOptions,
  type GCSServiceAccountAuth,
  type GetObjectOptions,
  type GetObjectResult,
  type GetObjectStreamOptions,
  type GetObjectStreamResult,
  type HeadObjectOptions,
  type ListObjectsOptions,
  type ListObjectsResult,
  type PutObjectOptions,
  type PutObjectStreamOptions,
  RESUMABLE_CHUNK_MULTIPLE,
} from './GCS.ts';
export * from './errors/mod.ts';
export {
  type ErrorDetailSchema,
  ErrorDetailSchemaObject,
  type ErrorEnvelopeSchema,
  ErrorEnvelopeSchemaObject,
  type ListObjectsResponseSchema,
  ListObjectsResponseSchemaObject,
  type ObjectSchema,
  ObjectSchemaObject,
} from './schema/mod.ts';
