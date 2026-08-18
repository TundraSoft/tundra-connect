/**
 * @module @tundraconnect/s3
 *
 * AWS S3 (and S3-compatible: Cloudflare R2, MinIO, self-hosted) object
 * storage client, signing every request with AWS Signature Version 4.
 *
 * @example
 * ```typescript
 * import { S3 } from '@tundraconnect/s3';
 *
 * const client = new S3({
 *   auth: {
 *     type: 'CUSTOM',
 *     accessKeyId: 'AKIA...',
 *     secretAccessKey: '...',
 *     region: 'us-east-1',
 *   },
 * });
 *
 * await client.putObject({ bucket: 'my-bucket', key: 'hello.txt', body: 'Hello!' });
 * ```
 */
export { S3, type S3Auth, type S3Options } from './S3.ts';
export * from './errors/mod.ts';
export * from './schema/mod.ts';
