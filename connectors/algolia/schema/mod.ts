/**
 * Guardian schemas behind `@tundraconnect/algolia`: every request and response
 * shape the client validates, each exported as a schema object with its
 * inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { SearchResponseSchemaObject } from '@tundraconnect/algolia/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = SearchResponseSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export {
  type AlgoliaObjectPayloadSchema,
  AlgoliaObjectPayloadSchemaObject,
  type AlgoliaObjectSchema,
  AlgoliaObjectSchemaObject,
} from './Common.ts';

export {
  type ErrorEnvelopeSchema,
  ErrorEnvelopeSchemaObject,
} from './Error.ts';

export {
  type SearchRequestSchema,
  SearchRequestSchemaObject,
  type SearchResponseSchema,
  SearchResponseSchemaObject,
} from './Search.ts';

export {
  type SaveObjectResponseSchema,
  SaveObjectResponseSchemaObject,
} from './SaveObject.ts';

export {
  type DeleteObjectResponseSchema,
  DeleteObjectResponseSchemaObject,
} from './DeleteObject.ts';

export {
  type BrowseRequestSchema,
  BrowseRequestSchemaObject,
  type BrowseResponseSchema,
  BrowseResponseSchemaObject,
} from './Browse.ts';

export { type TaskStatusSchema, TaskStatusSchemaObject } from './Task.ts';
