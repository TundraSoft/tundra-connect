/**
 * Guardian schemas behind `@tundraconnect/urlhaus`: every URLhaus response
 * shape the client validates, each exported as a schema object with its
 * inferred TypeScript type. Numeric values URLhaus sends as strings (ids,
 * counts, sizes) stay strings, exactly as on the wire.
 *
 * @example
 * ```ts
 * import { UrlEntrySchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * declare const body: unknown; // e.g. a cached /v1/url/ response
 * const [error, entry] = UrlEntrySchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(entry?.url_status, entry?.tags);
 * ```
 *
 * @module
 */

export {
  type BlacklistsSchema,
  BlacklistsSchemaObject,
  type QueryStatusEnvelopeSchema,
  QueryStatusEnvelopeSchemaObject,
  URLHAUS_QUERY_STATUSES,
  type VirusTotalSchema,
  VirusTotalSchemaObject,
} from './Common.ts';
export {
  type HostEntrySchema,
  HostEntrySchemaObject,
  type HostUrlSchema,
  HostUrlSchemaObject,
} from './Host.ts';
export {
  type PayloadEntrySchema,
  PayloadEntrySchemaObject,
  type PayloadUrlSchema,
  PayloadUrlSchemaObject,
} from './Payload.ts';
export {
  type RecentPayloadsSchema,
  RecentPayloadsSchemaObject,
  type RecentUrlSchema,
  RecentUrlSchemaObject,
  type RecentUrlsSchema,
  RecentUrlsSchemaObject,
} from './Recent.ts';
export {
  type SignatureEntrySchema,
  SignatureEntrySchemaObject,
  type SignatureUrlSchema,
  SignatureUrlSchemaObject,
} from './Signature.ts';
export {
  type TagEntrySchema,
  TagEntrySchemaObject,
  type TagUrlSchema,
  TagUrlSchemaObject,
} from './Tag.ts';
export {
  type UrlEntrySchema,
  UrlEntrySchemaObject,
  type UrlPayloadSchema,
  UrlPayloadSchemaObject,
} from './Url.ts';
