/**
 * Guardian schemas behind `@tundraconnect/telegram`: every request and response
 * shape the client validates, each exported as a schema object with its
 * inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { MessageSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = MessageSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export * from './Common.ts';
export * from './Error.ts';
export * from './SendMessage.ts';
export * from './User.ts';
