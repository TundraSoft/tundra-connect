/**
 * @module @tundraconnect/azure-blob
 */

// Export main client class
export {
  AzureBlob,
  type AzureBlobAuth,
  type AzureBlobOptions,
  type DeleteObjectOptions,
  type GetObjectOptions,
  type HeadObjectOptions,
  type ListedObject,
  type ListObjectsOptions,
  type ListObjectsResult,
  type PutObjectOptions,
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
