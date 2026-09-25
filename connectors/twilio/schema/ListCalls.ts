import { type BaseGuardian, Guardian } from '@guardian';
import { CALL_STATUSES, type CallSchema, CallSchemaObject } from './Call.ts';
import { callSidGuard, dateOnlyGuard } from './Common.ts';

/**
 * Schema for {@link Twilio.listCalls} request options
 *
 * Validates the camelCase filter/pagination options accepted by
 * `listCalls()` before they're translated into Twilio's PascalCase query
 * parameters for `GET /2010-04-01/Accounts/{AccountSid}/Calls.json`. The
 * `startTime`/`endTime` filters (and their `Before`/`After` variants) take
 * a plain `YYYY-MM-DD` date, not a full datetime — see {@link dateOnlyGuard}.
 *
 * @example
 * ```typescript
 * import { ListCallsRequestSchemaObject } from '@tundraconnect/twilio/schemas';
 *
 * const [error, options] = ListCallsRequestSchemaObject.safeParse({
 *   status: 'completed',
 *   pageSize: 20,
 * });
 * if (!error) {
 *   console.log('Valid filter:', options.status);
 * }
 * ```
 */
export type ListCallsRequestSchema = {
  to?: string;
  from?: string;
  parentCallSid?: string;
  status?: (typeof CALL_STATUSES)[number];
  startTime?: string;
  startTimeBefore?: string;
  startTimeAfter?: string;
  endTime?: string;
  endTimeBefore?: string;
  endTimeAfter?: string;
  pageSize?: number;
  page?: number;
  pageToken?: string;
};

const _listCallsRequestSchema: BaseGuardian<ListCallsRequestSchema> = Guardian
  .object({
    /** Only include calls made to this phone number, SIP address, Client identifier, or SIM SID. */
    to: Guardian.string().minLength(1).optional(),
    /** Only include calls made from this phone number, SIP address, Client identifier, or SIM SID. */
    from: Guardian.string().minLength(1).optional(),
    /** Only include calls spawned by the call with this SID. */
    parentCallSid: callSidGuard.optional(),
    /** Only include calls in this status. */
    status: Guardian.enum(CALL_STATUSES).optional(),
    /** Only include calls that started on this UTC date (`YYYY-MM-DD`). */
    startTime: dateOnlyGuard.optional(),
    /** Only include calls that started before this UTC date (`YYYY-MM-DD`). */
    startTimeBefore: dateOnlyGuard.optional(),
    /** Only include calls that started on or after this UTC date (`YYYY-MM-DD`). */
    startTimeAfter: dateOnlyGuard.optional(),
    /** Only include calls that ended on this UTC date (`YYYY-MM-DD`). */
    endTime: dateOnlyGuard.optional(),
    /** Only include calls that ended before this UTC date (`YYYY-MM-DD`). */
    endTimeBefore: dateOnlyGuard.optional(),
    /** Only include calls that ended on or after this UTC date (`YYYY-MM-DD`). */
    endTimeAfter: dateOnlyGuard.optional(),
    /** Resources to return per page (1-1000, default 50). */
    pageSize: Guardian.number().integer().min(1).max(1000).optional(),
    /** Page index; client-side state only, per Twilio's docs. */
    page: Guardian.number().integer().min(0).optional(),
    /** Opaque pagination cursor, taken from a previous page's `next_page_uri`. */
    pageToken: Guardian.string().minLength(1).optional(),
  }).describe({
    title: 'List calls request',
    description:
      'Filter/pagination options accepted by Twilio.listCalls(), validated before the API call.',
  });

/** Guardian schema that validates a {@link ListCallsRequestSchema}. */
export const ListCallsRequestSchemaObject: BaseGuardian<
  ListCallsRequestSchema
> = _listCallsRequestSchema;

/**
 * Extracts the `PageToken` query parameter from a `next_page_uri` value
 * (a path-only URI, e.g.
 * `/2010-04-01/Accounts/ACxx/Calls.json?Page=1&PageToken=PACAxx`), so
 * callers get a ready-to-use cursor instead of having to parse it out
 * themselves. Returns `undefined` on the last page (`next_page_uri` is
 * `null`) or if the URI is present but doesn't carry a `PageToken`.
 */
function _extractNextPageToken(nextPageUri: string | null): string | undefined {
  if (!nextPageUri) return undefined;
  try {
    return new URL(nextPageUri, 'https://api.twilio.com').searchParams.get(
      'PageToken',
    ) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Schema for the paginated Read-multiple-Calls response
 *
 * Validates the response body returned by
 * `GET /2010-04-01/Accounts/{AccountSid}/Calls.json`: a page of
 * {@link CallSchema} entries under `calls`, plus Twilio's standard
 * page/cursor metadata. `next_page_uri` is `null` on the last page. Adds a
 * convenience `nextPageToken` field — Twilio's `PageToken` cursor extracted
 * from `next_page_uri` — alongside the raw vendor fields, so a caller
 * doesn't have to parse it out manually; pass it back as
 * `ListCallsRequestSchema.pageToken` to fetch the following page.
 *
 * @example
 * ```typescript
 * import { ListCallsResponseSchemaObject } from '@tundraconnect/twilio/schemas';
 *
 * const [error, page] = ListCallsResponseSchemaObject.safeParse({
 *   calls: [],
 *   end: 0,
 *   first_page_uri: '/2010-04-01/Accounts/ACxx/Calls.json?Page=0',
 *   next_page_uri: null,
 *   page: 0,
 *   page_size: 50,
 *   previous_page_uri: null,
 *   start: 0,
 *   uri: '/2010-04-01/Accounts/ACxx/Calls.json',
 * });
 * if (!error) {
 *   console.log('Calls on this page:', page.calls.length);
 *   console.log('Next page token:', page.nextPageToken); // undefined
 * }
 * ```
 */
export type ListCallsResponseSchema = {
  calls: CallSchema[];
  end: number;
  first_page_uri: string;
  next_page_uri: string | null;
  page: number;
  page_size: number;
  previous_page_uri: string | null;
  start: number;
  uri: string;
  /**
   * Twilio's `PageToken` cursor, extracted from `next_page_uri` for
   * convenience. `undefined` on the last page.
   */
  nextPageToken?: string;
};

const _listCallsResponseSchema: BaseGuardian<ListCallsResponseSchema> = Guardian
  .object({
    /** The page of Call resources. */
    calls: Guardian.array(CallSchemaObject),
    /** Index of the last result on this page. */
    end: Guardian.number().integer(),
    /** URI of the first page of results. */
    first_page_uri: Guardian.string(),
    /** URI of the next page of results; `null` on the last page. */
    next_page_uri: Guardian.string().nullable(),
    /** Index of this page. */
    page: Guardian.number().integer(),
    /** Number of results requested per page. */
    page_size: Guardian.number().integer(),
    /** URI of the previous page of results; `null` on the first page. */
    previous_page_uri: Guardian.string().nullable(),
    /** Index of the first result on this page. */
    start: Guardian.number().integer(),
    /** URI of this page of results. */
    uri: Guardian.string(),
  }).transform((result) => ({
    ...result,
    nextPageToken: _extractNextPageToken(result.next_page_uri),
  })).describe({
    title: 'List calls response',
    description:
      'A paginated page of Call resources, returned by the Calls list endpoint, with a convenience nextPageToken cursor.',
  });

/** Guardian schema that validates a {@link ListCallsResponseSchema}. */
export const ListCallsResponseSchemaObject: BaseGuardian<
  ListCallsResponseSchema
> = _listCallsResponseSchema;
