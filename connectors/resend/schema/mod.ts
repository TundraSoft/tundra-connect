/**
 * Guardian schemas behind `@tundraconnect/resend`: every request and
 * response shape the client validates, each exported as a schema object with
 * its inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { SendEmailRequestSchemaObject } from '@tundraconnect/resend/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = SendEmailRequestSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export { type AttachmentSchema, AttachmentSchemaObject } from './Attachment.ts';
export { type EmailSchema, EmailSchemaObject } from './Email.ts';
export { type EmailRefSchema, EmailRefSchemaObject } from './EmailRef.ts';
export {
  type ErrorResponseSchema,
  ErrorResponseSchemaObject,
} from './Error.ts';
export {
  type SendBatchResponseSchema,
  SendBatchResponseSchemaObject,
} from './SendBatchResponse.ts';
export {
  MAX_RECIPIENTS,
  type SendEmailRequestSchema,
  SendEmailRequestSchemaObject,
  SENDER_PATTERN,
  type TemplateSchema,
  TemplateSchemaObject,
} from './SendEmailRequest.ts';
export { TAG_PATTERN, type TagSchema, TagSchemaObject } from './Tag.ts';
export {
  type WebhookEventSchema,
  WebhookEventSchemaObject,
} from './WebhookEvent.ts';
