/**
 * Guardian schemas behind `@tundraconnect/cloudflare-email`: every request and
 * response shape the client validates, each exported as a schema object with
 * its inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { SendEmailRequestSchemaObject } from '@tundraconnect/cloudflare-email/schemas';
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
export {
  type ErrorEnvelopeSchema,
  ErrorEnvelopeSchemaObject,
  type ErrorItemSchema,
  ErrorItemSchemaObject,
} from './Error.ts';
export {
  MAX_RECIPIENTS,
  type SendEmailRequestSchema,
  SendEmailRequestSchemaObject,
} from './SendEmailRequest.ts';
export {
  type SendEmailResultSchema,
  SendEmailResultSchemaObject,
} from './SendEmailResult.ts';
