/**
 * Guardian schemas behind `@tundraconnect/eia`: v2 data pages, route
 * metadata, facet values and the error body. Use them to validate a
 * payload you stored elsewhere, or to type your own code.
 *
 * @example
 * ```ts
 * import { EIADataResponseSchemaObject } from '@tundraconnect/eia/schemas';
 *
 * declare const body: unknown; // e.g. a recorded page
 * const [error, value] = EIADataResponseSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value.response.data.length);
 * ```
 *
 * @module
 */

export {
  type EIAChildRouteSchema,
  type EIADataResponseSchema,
  EIADataResponseSchemaObject,
  type EIAErrorBodySchema,
  EIAErrorBodySchemaObject,
  type EIAFacetSchema,
  type EIAFacetValueSchema,
  type EIAFacetValuesSchema,
  EIAFacetValuesSchemaObject,
  type EIAFrequencySchema,
  type EIARequestEchoSchema,
  type EIARouteSchema,
  EIARouteSchemaObject,
  type EIARowSchema,
  EIARowSchemaObject,
  type EIAWarningSchema,
  EIAWarningSchemaObject,
} from './Response.ts';
