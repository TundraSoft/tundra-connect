/**
 * Guardian schemas behind `@tundraconnect/s3`: every request and response shape
 * the client validates, each exported as a schema object with its inferred
 * TypeScript type. Use them to validate a payload you stored or received
 * elsewhere (a webhook body, a cached response), or to type your own code
 * against the client's shapes.
 *
 * @example
 * ```ts
 * import { ListObjectsResponseSchemaObject } from '@tundraconnect/s3/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = ListObjectsResponseSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

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

export {
  type CompleteMultipartUploadResultSchema,
  CompleteMultipartUploadResultSchemaObject,
  type InitiateMultipartUploadResultSchema,
  InitiateMultipartUploadResultSchemaObject,
} from './Multipart.ts';

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
