/**
 * @module @tundraconnect/azure-blob
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
