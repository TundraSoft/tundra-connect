/**
 * Typed, cross-runtime client for AWS S3 and S3-compatible object storage
 * (Cloudflare R2, MinIO, DigitalOcean Spaces, self-hosted gateways), signing
 * every request with
 * [AWS Signature Version
 * 4](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv4.html).
 *
 * Typed S3 client with SigV4 signing for AWS S3, Cloudflare R2, MinIO and
 * DigitalOcean Spaces: object CRUD and listing, plus streamed multipart uploads
 * and downloads.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`S3Error` and its code registry).
 *
 * @example
 * ```ts
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
 * await client.putObject({
 *   bucket: 'my-bucket',
 *   key: 'hello.txt',
 *   body: 'Hello!',
 * });
 *
 * const obj = await client.getObject({ bucket: 'my-bucket', key: 'hello.txt' });
 * console.log(await obj.body.text());
 * ```
 *
 * @module
 */

export {
  DEFAULT_PART_SIZE,
  type GetObjectStreamResult,
  MIN_PART_SIZE,
  type PutObjectStreamOptions,
  S3,
  type S3Auth,
  type S3Options,
} from './S3.ts';
export * from './errors/mod.ts';
export * from './schema/mod.ts';
