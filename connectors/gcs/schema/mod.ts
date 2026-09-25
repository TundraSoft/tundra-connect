/**
 * Guardian schemas behind `@tundraconnect/gcs`: every request and response
 * shape the client validates, each exported as a schema object with its
 * inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { ObjectSchemaObject } from '@tundraconnect/gcs/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = ObjectSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export { type ObjectSchema, ObjectSchemaObject } from './Object.ts';

export {
  type ListObjectsResponseSchema,
  ListObjectsResponseSchemaObject,
} from './ListObjectsResponse.ts';

export {
  type ErrorDetailSchema,
  ErrorDetailSchemaObject,
  type ErrorEnvelopeSchema,
  ErrorEnvelopeSchemaObject,
} from './Error.ts';
