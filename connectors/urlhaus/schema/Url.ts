import { type BaseGuardian, Guardian } from '@guardian';
import {
  type BlacklistsSchema,
  BlacklistsSchemaObject,
  type VirusTotalSchema,
  VirusTotalSchemaObject,
} from './Common.ts';

/**
 * Type definition for {@link UrlPayloadSchemaObject} — one file a malware
 * URL was seen serving.
 *
 * Numeric values (`response_size`) arrive as strings and are kept that way.
 */
export type UrlPayloadSchema = {
  /** Date (`YYYY-MM-DD`) the payload was first seen on this URL. */
  firstseen?: string;
  /** File name, when the server sent one; otherwise `null`. */
  filename?: string | null;
  /** File type guessed by URLhaus, e.g. `exe`, `doc`. */
  file_type?: string;
  /** Size in bytes of the HTTP response body, as a string. */
  response_size?: string;
  /** MD5 of the HTTP response body. */
  response_md5?: string;
  /** SHA-256 of the HTTP response body. */
  response_sha256?: string;
  /** Where a copy can be downloaded from URLhaus. */
  urlhaus_download?: string;
  /** Malware family, when known; otherwise `null`. */
  signature?: string | null;
  /** VirusTotal summary, when available; otherwise `null`. */
  virustotal?: VirusTotalSchema | null;
  /** Import hash, when available. */
  imphash?: string | null;
  /** ssdeep fuzzy hash, when available. */
  ssdeep?: string | null;
  /** TLSH fuzzy hash, when available. */
  tlsh?: string | null;
  /** File type as identified by Magika, when available. */
  magika?: string | null;
};

/**
 * Schema for one entry of a URL lookup's `payloads` array.
 *
 * @example
 * ```typescript
 * import { UrlPayloadSchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, payload] = UrlPayloadSchemaObject.safeParse({
 *   firstseen: '2019-01-19',
 *   file_type: 'doc',
 *   response_sha256: 'dc9f3b226bccb2f1fd4810cde541e5a10d59a1fe683f4a9462293b6ade8d8403',
 *   virustotal: null,
 * });
 * ```
 */
export const UrlPayloadSchemaObject: BaseGuardian<UrlPayloadSchema> = Guardian
  .object({
    firstseen: Guardian.string().optional(),
    filename: Guardian.string().nullable().optional(),
    file_type: Guardian.string().optional(),
    response_size: Guardian.string().optional(),
    response_md5: Guardian.string().optional(),
    response_sha256: Guardian.string().optional(),
    urlhaus_download: Guardian.string().optional(),
    signature: Guardian.string().nullable().optional(),
    virustotal: VirusTotalSchemaObject.nullable().optional(),
    imphash: Guardian.string().nullable().optional(),
    ssdeep: Guardian.string().nullable().optional(),
    tlsh: Guardian.string().nullable().optional(),
    magika: Guardian.string().nullable().optional(),
  }).passthrough().describe({
    title: 'URLhaus URL payload',
    description: 'One file a malware URL was observed serving.',
  });

/**
 * Type definition for {@link UrlEntrySchemaObject} — what URLhaus knows
 * about one malware URL (the `ok` form of `/v1/url/` and `/v1/urlid/`).
 *
 * Every field is optional: URLhaus's own examples are inconsistent, and a
 * missing cosmetic field must never turn a LISTED URL into a schema error.
 */
export type UrlEntrySchema = {
  /** URLhaus database id, as a string. */
  id?: string;
  /** Link to the URLhaus entry. */
  urlhaus_reference?: string;
  /** The malware URL as URLhaus recorded it. */
  url?: string;
  /** `online` (serving a payload), `offline`, or `unknown`. */
  url_status?: string;
  /** Host extracted from the URL (IP address or domain). */
  host?: string;
  /** When the URL was added, e.g. `2019-01-19 01:33:26 UTC`. */
  date_added?: string;
  /** When an offline URL last served malware; `null` while online. */
  last_online?: string | null;
  /** The threat — `malware_download` (malware distribution site). */
  threat?: string;
  /** Spamhaus DBL / SURBL status. */
  blacklists?: BlacklistsSchema;
  /** Reporter handle, or `anonymous`. */
  reporter?: string;
  /** Whether the hosting provider was notified — `'true'` or `'false'`. */
  larted?: string;
  /** Takedown time in seconds (as a string), or `null`. */
  takedown_time_seconds?: string | null;
  /** Tags, e.g. `['emotet', 'heodo']`; `null` when there are none. */
  tags?: string[] | null;
  /** Files this URL served (max 100). */
  payloads?: UrlPayloadSchema[] | null;
};

/**
 * Schema for a URL lookup's `ok` body.
 *
 * @example
 * ```typescript
 * import { UrlEntrySchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, entry] = UrlEntrySchemaObject.safeParse({
 *   id: '105821',
 *   url: 'http://sskymedia.com/VMYB-ht_JAQo-gi/',
 *   url_status: 'online',
 *   threat: 'malware_download',
 *   tags: ['emotet'],
 * });
 * ```
 */
export const UrlEntrySchemaObject: BaseGuardian<UrlEntrySchema> = Guardian
  .object({
    id: Guardian.string().optional(),
    urlhaus_reference: Guardian.string().optional(),
    url: Guardian.string().optional(),
    url_status: Guardian.string().optional(),
    host: Guardian.string().optional(),
    date_added: Guardian.string().optional(),
    last_online: Guardian.string().nullable().optional(),
    threat: Guardian.string().optional(),
    blacklists: BlacklistsSchemaObject.optional(),
    reporter: Guardian.string().optional(),
    larted: Guardian.string().optional(),
    takedown_time_seconds: Guardian.string().nullable().optional(),
    tags: Guardian.array(Guardian.string()).nullable().optional(),
    payloads: Guardian.array(UrlPayloadSchemaObject).nullable().optional(),
  }).passthrough().describe({
    title: 'URLhaus URL entry',
    description: 'What URLhaus knows about one malware URL.',
  });
