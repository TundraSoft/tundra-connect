/**
 * @module @tundraconnect/gcs
 *
 * Typed, cross-runtime Google Cloud Storage JSON API client. Implements
 * this repository's canonical object-storage interface (`putObject` /
 * `getObject` / `deleteObject` / `listObjects` / `headObject`) on top of
 * RESTler and Guardian.
 */
export {
  type DeleteObjectOptions,
  GCS,
  type GCSAuth,
  type GCSBearerAuth,
  type GCSOptions,
  type GCSServiceAccountAuth,
  type GetObjectOptions,
  type GetObjectResult,
  type HeadObjectOptions,
  type ListObjectsOptions,
  type ListObjectsResult,
  type PutObjectOptions,
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
