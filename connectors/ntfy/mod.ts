/**
 * Typed, cross-runtime client for [ntfy.sh](https://ntfy.sh), a simple
 * pub-sub push-notification service.
 *
 * Typed ntfy.sh client for publishing push notifications to a topic.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`NtfyError` and its code registry).
 *
 * @example
 * ```ts
 * import { Ntfy } from '@tundraconnect/ntfy';
 *
 * const client = new Ntfy();
 *
 * const message = await client.publish({
 *   topic: 'mytopic',
 *   title: 'Disk space alert',
 *   message: 'Disk usage on server1 is at 90%',
 *   priority: 4,
 *   tags: ['warning', 'floppy_disk'],
 * });
 *
 * console.log(message.id);
 * ```
 *
 * @module
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
