import type { ObjectMetadataSchema } from './Common.ts';

/**
 * Type for a GetObject result
 *
 * The body is a raw `Blob` (read via `responseType: 'BLOB'`, see
 * {@link S3.ts}'s `getObject`) — Guardian has no binary-body validator, so
 * it is intersected onto the header-derived {@link ObjectMetadataSchemaObject}
 * shape rather than modeled as part of the Guardian schema itself.
 */
export type GetObjectResponseSchema =
  & ObjectMetadataSchema
  & { body: Blob };
