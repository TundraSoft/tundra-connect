import type { ObjectMetadataSchema } from './Common.ts';

/**
 * Type for a HeadObject result
 *
 * Identical to {@link GetObject.ts}'s metadata shape minus the body — a
 * `HEAD` response carries the same headers as `GET` but S3 sends no
 * content for either request.
 */
export type HeadObjectResponseSchema = ObjectMetadataSchema;
