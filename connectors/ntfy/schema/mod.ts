/**
 * Guardian schemas behind `@tundraconnect/ntfy`: every request and response
 * shape the client validates, each exported as a schema object with its
 * inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { PublishRequestSchemaObject } from '@tundraconnect/ntfy/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = PublishRequestSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export { type ErrorSchema, ErrorSchemaObject } from './Error.ts';
export {
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
  type PublishRequestSchema,
  PublishRequestSchemaObject,
} from './PublishRequest.ts';
export {
  type PublishAttachmentSchema,
  PublishAttachmentSchemaObject,
  type PublishResponseSchema,
  PublishResponseSchemaObject,
} from './PublishResponse.ts';
