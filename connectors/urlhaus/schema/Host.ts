import { type BaseGuardian, Guardian } from '@guardian';
import { type BlacklistsSchema, BlacklistsSchemaObject } from './Common.ts';

/** Type definition for {@link HostUrlSchemaObject} — one malware URL on a host. */
export type HostUrlSchema = {
  /** URLhaus database id, as a string. */
  id?: string;
  /** Link to the URLhaus entry. */
  urlhaus_reference?: string;
  /** The malware URL. */
  url?: string;
  /** `online`, `offline`, or `unknown`. */
  url_status?: string;
  /** When the URL was added, e.g. `2019-02-11 07:45:05 UTC`. */
  date_added?: string;
  /** The threat — `malware_download`. */
  threat?: string;
  /** Reporter handle, or `anonymous`. */
  reporter?: string;
  /** Whether the hosting provider was notified — `'true'` or `'false'`. */
  larted?: string;
  /** Takedown time in seconds (as a string), or `null`. */
  takedown_time_seconds?: string | null;
  /** Tags; `null` when there are none. */
  tags?: string[] | null;
};

/**
 * Schema for one entry of a host lookup's `urls` array.
 *
 * @example
 * ```typescript
 * import { HostUrlSchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, url] = HostUrlSchemaObject.safeParse({
 *   id: '121319',
 *   url: 'http://vektorex.com/source/Z/5016223.exe',
 *   url_status: 'online',
 * });
 * ```
 */
export const HostUrlSchemaObject: BaseGuardian<HostUrlSchema> = Guardian
  .object({
    id: Guardian.string().optional(),
    urlhaus_reference: Guardian.string().optional(),
    url: Guardian.string().optional(),
    url_status: Guardian.string().optional(),
    date_added: Guardian.string().optional(),
    threat: Guardian.string().optional(),
    reporter: Guardian.string().optional(),
    larted: Guardian.string().optional(),
    takedown_time_seconds: Guardian.string().nullable().optional(),
    tags: Guardian.array(Guardian.string()).nullable().optional(),
  }).passthrough().describe({
    title: 'URLhaus host URL',
    description: 'One malware URL observed on a host.',
  });

/**
 * Type definition for {@link HostEntrySchemaObject} — what URLhaus knows
 * about a host (the `ok` form of `/v1/host/`).
 */
export type HostEntrySchema = {
  /** Link to the URLhaus host page. */
  urlhaus_reference?: string;
  /** The host queried. */
  host?: string;
  /** When the host was first seen, e.g. `2019-01-15 07:09:01 UTC`. */
  firstseen?: string;
  /** Number of malware URLs observed on the host, as a string. */
  url_count?: string;
  /** Spamhaus DBL / SURBL status. Absent for an IPv4 host. */
  blacklists?: BlacklistsSchema;
  /** Malware URLs on the host (max 100). */
  urls?: HostUrlSchema[] | null;
};

/**
 * Schema for a host lookup's `ok` body.
 *
 * @example
 * ```typescript
 * import { HostEntrySchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, host] = HostEntrySchemaObject.safeParse({
 *   host: 'vektorex.com',
 *   url_count: '120',
 *   urls: [],
 * });
 * ```
 */
export const HostEntrySchemaObject: BaseGuardian<HostEntrySchema> = Guardian
  .object({
    urlhaus_reference: Guardian.string().optional(),
    host: Guardian.string().optional(),
    firstseen: Guardian.string().optional(),
    url_count: Guardian.string().optional(),
    blacklists: BlacklistsSchemaObject.optional(),
    urls: Guardian.array(HostUrlSchemaObject).nullable().optional(),
  }).passthrough().describe({
    title: 'URLhaus host entry',
    description: 'What URLhaus knows about a host.',
  });
