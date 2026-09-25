/**
 * Guardian schemas behind `@tundraconnect/sendgrid`: every request and response
 * shape the client validates, each exported as a schema object with its
 * inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { MailSendRequestSchemaObject } from '@tundraconnect/sendgrid/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = MailSendRequestSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export * from './common/mod.ts';
export * from './request/mod.ts';
export * from './response/mod.ts';
