/**
 * Typed, cross-runtime client for the [Azure Blob Storage REST
 * API](https://learn.microsoft.com/en-us/rest/api/storageservices/blob-service-rest-api).
 *
 * Typed Azure Blob Storage client with Shared Key or SAS auth: upload,
 * download, list, inspect and delete blobs, including streamed block uploads
 * and downloads for large files.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`AzureBlobError` and its code registry).
 *
 * @example
 * ```ts
 * import { AzureBlob } from '@tundraconnect/azure-blob';
 *
 * const client = new AzureBlob({
 *   auth: {
 *     type: 'CUSTOM',
 *     account: 'myaccount',
 *     accountKey: 'base64-shared-key',
 *   },
 * });
 *
 * await client.putObject({
 *   bucket: 'my-container',
 *   key: 'hello.txt',
 *   body: 'hello world',
 *   contentType: 'text/plain',
 * });
 *
 * const { body } = await client.getObject({
 *   bucket: 'my-container',
 *   key: 'hello.txt',
 * });
 * console.log(await body.text());
 * ```
 *
 * @module
 */

// Export main client class
export {
  AzureBlob,
  type AzureBlobAuth,
  type AzureBlobOptions,
  DEFAULT_BLOCK_SIZE,
  type DeleteObjectOptions,
  type GetObjectOptions,
  type GetObjectStreamResult,
  type HeadObjectOptions,
  type ListedObject,
  type ListObjectsOptions,
  type ListObjectsResult,
  type PutObjectOptions,
  type PutObjectStreamOptions,
} from './AzureBlob.ts';

// Export error handling
export * from './errors/mod.ts';

// Export all schema types and objects for advanced usage
export {
  type BlobItemSchema,
  BlobItemSchemaObject,
  type BlobPropertiesSchema,
  BlobPropertiesSchemaObject,
  type ErrorSchema,
  ErrorSchemaObject,
  type GetObjectResultSchema,
  GetObjectResultSchemaObject,
  type HeadObjectResultSchema,
  HeadObjectResultSchemaObject,
  type ListBlobsResponseSchema,
  ListBlobsResponseSchemaObject,
  type PutObjectResultSchema,
  PutObjectResultSchemaObject,
} from './schema/mod.ts';
