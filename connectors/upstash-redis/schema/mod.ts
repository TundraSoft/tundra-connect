/**
 * Guardian schemas behind `@tundraconnect/upstash-redis`: every request and
 * response shape the client validates, each exported as a schema object with
 * its inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { PipelineResponseSchemaObject } from '@tundraconnect/upstash-redis/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = PipelineResponseSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export { type ErrorSchema, ErrorSchemaObject } from './Error.ts';
export { type CommandSchema, CommandSchemaObject } from './Command.ts';
export {
  type StringResultSchema,
  StringResultSchemaObject,
} from './StringResult.ts';
export {
  type StatusResultSchema,
  StatusResultSchemaObject,
} from './StatusResult.ts';
export {
  type IntegerResultSchema,
  IntegerResultSchemaObject,
} from './IntegerResult.ts';
export {
  type ArrayResultSchema,
  ArrayResultSchemaObject,
} from './ArrayResult.ts';
export { type AnyResultSchema, AnyResultSchemaObject } from './AnyResult.ts';
export {
  type PipelineRequestSchema,
  PipelineRequestSchemaObject,
  type PipelineResponseSchema,
  PipelineResponseSchemaObject,
  type PipelineResultSchema,
  PipelineResultSchemaObject,
} from './Pipeline.ts';
