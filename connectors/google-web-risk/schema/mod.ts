/**
 * Guardian schemas behind `@tundraconnect/google-web-risk`: the `uris:search`
 * request and response, the threat-type enum, and Google's error envelope —
 * each exported as a schema object with its inferred TypeScript type.
 *
 * @example
 * ```ts
 * import { SearchUrisResponseSchemaObject } from '@tundraconnect/google-web-risk/schemas';
 *
 * declare const body: unknown; // e.g. a cached uris:search response
 * const [error, value] = SearchUrisResponseSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value?.threat?.threatTypes ?? 'not listed');
 * ```
 *
 * @module
 */

export {
  type GoogleErrorDetailSchema,
  GoogleErrorDetailSchemaObject,
  type GoogleErrorEnvelopeSchema,
  GoogleErrorEnvelopeSchemaObject,
} from './Error.ts';
export {
  type SearchUrisRequestSchema,
  SearchUrisRequestSchemaObject,
  type SearchUrisResponseSchema,
  SearchUrisResponseSchemaObject,
  type SearchUrisThreatSchema,
  SearchUrisThreatSchemaObject,
} from './SearchUris.ts';
export {
  DEFAULT_THREAT_TYPES,
  type ThreatTypeSchema,
  ThreatTypeSchemaObject,
  WEB_RISK_THREAT_TYPES,
} from './ThreatType.ts';
