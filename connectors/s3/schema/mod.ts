/** Guardian schemas exported by `@tundraconnect/s3/schemas`. */
export {
  bucketGuard,
  etagGuard,
  keyGuard,
  metadataGuard,
  type ObjectMetadataSchema,
  ObjectMetadataSchemaObject,
} from './Common.ts';

export {
  type S3ErrorEnvelopeSchema,
  S3ErrorEnvelopeSchemaObject,
} from './Error.ts';

export {
  type PutObjectResponseSchema,
  PutObjectResponseSchemaObject,
} from './PutObject.ts';

export type { GetObjectResponseSchema } from './GetObject.ts';

export type { HeadObjectResponseSchema } from './HeadObject.ts';

export {
  type DeleteObjectResponseSchema,
  DeleteObjectResponseSchemaObject,
} from './DeleteObject.ts';

export {
  type ListObjectsResponseSchema,
  ListObjectsResponseSchemaObject,
  type S3ObjectSchema,
  S3ObjectSchemaObject,
} from './ListObjects.ts';
