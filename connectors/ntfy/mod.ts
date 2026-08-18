/**
 * @module @tundraconnect/ntfy
 */

// Export main client class
export { Ntfy, type NtfyOptions } from './Ntfy.ts';

// Export error handling
export * from './errors/mod.ts';

// Export all schema types and objects for advanced usage
export {
  type ErrorSchema,
  ErrorSchemaObject,
  type PublishActionBroadcastSchema,
  PublishActionBroadcastSchemaObject,
  type PublishActionCopySchema,
  PublishActionCopySchemaObject,
  type PublishActionHttpSchema,
  PublishActionHttpSchemaObject,
  type PublishActionSchema,
  PublishActionSchemaObject,
  type PublishActionViewSchema,
  PublishActionViewSchemaObject,
  type PublishAttachmentSchema,
  PublishAttachmentSchemaObject,
  type PublishRequestSchema,
  PublishRequestSchemaObject,
  type PublishResponseSchema,
  PublishResponseSchemaObject,
} from './schema/mod.ts';
