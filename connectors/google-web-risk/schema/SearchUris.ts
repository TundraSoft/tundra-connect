import { type BaseGuardian, Guardian } from '@guardian';
import { type ThreatTypeSchema, ThreatTypeSchemaObject } from './ThreatType.ts';

/** Type definition for {@link SearchUrisRequestSchemaObject}. */
export type SearchUrisRequestSchema = {
  /**
   * The URI to check. It must be a valid URI (RFC 2396) but needn't be
   * canonicalized — Web Risk canonicalizes it server-side.
   */
  uri: string;
  /** The threat lists to search. At least one; duplicates are harmless. */
  threatTypes: ThreatTypeSchema[];
};

/**
 * Schema for the parameters of `GET /v1/uris:search`.
 *
 * @example
 * ```typescript
 * import { SearchUrisRequestSchemaObject } from '@tundraconnect/google-web-risk/schemas';
 *
 * const [error, request] = SearchUrisRequestSchemaObject.safeParse({
 *   uri: 'http://testsafebrowsing.appspot.com/s/malware.html',
 *   threatTypes: ['MALWARE'],
 * });
 * ```
 */
export const SearchUrisRequestSchemaObject: BaseGuardian<
  SearchUrisRequestSchema
> = Guardian.object({
  uri: Guardian.string().notEmpty('`uri` cannot be empty'),
  threatTypes: Guardian.array(ThreatTypeSchemaObject)
    .nonEmpty('At least one threat type is required'),
}).describe({
  title: 'uris:search request',
  description:
    'The URI to check and the Web Risk threat lists to check it against.',
});

/** Type definition for {@link SearchUrisThreatSchemaObject}. */
export type SearchUrisThreatSchema = {
  /**
   * The lists the URI is on — always a subset of the `threatTypes` the
   * request asked about.
   */
  threatTypes: ThreatTypeSchema[];
  /**
   * RFC 3339 timestamp (nanosecond precision) after which this match
   * should be treated as expired and looked up again.
   */
  expireTime?: string;
};

/**
 * Schema for the `threat` object of a `uris:search` match.
 *
 * `threatTypes` is held to the known enum: Web Risk only reports lists the
 * request asked about, and this client only lets a caller ask about the
 * enum's members.
 *
 * @example
 * ```typescript
 * import { SearchUrisThreatSchemaObject } from '@tundraconnect/google-web-risk/schemas';
 *
 * const [error, threat] = SearchUrisThreatSchemaObject.safeParse({
 *   threatTypes: ['MALWARE'],
 *   expireTime: '2019-07-17T15:01:23.045123456Z',
 * });
 * ```
 */
export const SearchUrisThreatSchemaObject: BaseGuardian<
  SearchUrisThreatSchema
> = Guardian.object({
  threatTypes: Guardian.array(ThreatTypeSchemaObject),
  expireTime: Guardian.string().optional(),
}).passthrough().describe({
  title: 'uris:search threat',
  description: 'The threat lists a URI matched, and when that match expires.',
});

/** Type definition for {@link SearchUrisResponseSchemaObject}. */
export type SearchUrisResponseSchema = {
  /** Present only when the URI is on at least one requested list. */
  threat?: SearchUrisThreatSchema;
};

/**
 * Schema for the `uris:search` response body: `{}` when the URI is on none
 * of the requested lists, `{ threat: {...} }` when it is on one or more.
 *
 * @example
 * ```typescript
 * import { SearchUrisResponseSchemaObject } from '@tundraconnect/google-web-risk/schemas';
 *
 * const [error, clean] = SearchUrisResponseSchemaObject.safeParse({});
 * ```
 */
export const SearchUrisResponseSchemaObject: BaseGuardian<
  SearchUrisResponseSchema
> = Guardian.object({
  threat: SearchUrisThreatSchemaObject.optional(),
}).passthrough().describe({
  title: 'uris:search response',
  description:
    'Empty when the URI is on no requested list; otherwise the matched lists and an expiry.',
});
