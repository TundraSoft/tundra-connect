import { type BaseGuardian, Guardian } from '@guardian';
import { type BlacklistsSchema, BlacklistsSchemaObject } from './Common.ts';
import {
  type PayloadEntrySchema,
  PayloadEntrySchemaObject,
} from './Payload.ts';

/** Type definition for {@link RecentUrlSchemaObject} — one recently added URL. */
export type RecentUrlSchema = {
  /** URLhaus database id, as a string. */
  id?: string;
  /** Link to the URLhaus entry. */
  urlhaus_reference?: string;
  /** The malware URL. */
  url?: string;
  /** `online`, `offline`, or `unknown`. */
  url_status?: string;
  /** Host extracted from the URL. */
  host?: string;
  /** When the URL was added. */
  date_added?: string;
  /** The threat — `malware_download`. */
  threat?: string;
  /** Spamhaus DBL / SURBL status. */
  blacklists?: BlacklistsSchema;
  /** Reporter handle, or `anonymous`. */
  reporter?: string;
  /** Whether the hosting provider was notified — `'true'` or `'false'`. */
  larted?: string;
  /** Tags; `null` when there are none. */
  tags?: string[] | null;
};

/**
 * Schema for one entry of the recent-URLs feed.
 *
 * @example
 * ```typescript
 * import { RecentUrlSchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, url] = RecentUrlSchemaObject.safeParse({
 *   id: '223622',
 *   url: 'http://45.61.49.78/razor/r4z0r.mips',
 *   url_status: 'offline',
 *   tags: ['elf'],
 * });
 * ```
 */
export const RecentUrlSchemaObject: BaseGuardian<RecentUrlSchema> = Guardian
  .object({
    id: Guardian.string().optional(),
    urlhaus_reference: Guardian.string().optional(),
    url: Guardian.string().optional(),
    url_status: Guardian.string().optional(),
    host: Guardian.string().optional(),
    date_added: Guardian.string().optional(),
    threat: Guardian.string().optional(),
    blacklists: BlacklistsSchemaObject.optional(),
    reporter: Guardian.string().optional(),
    larted: Guardian.string().optional(),
    tags: Guardian.array(Guardian.string()).nullable().optional(),
  }).passthrough().describe({
    title: 'URLhaus recent URL',
    description: 'One URL added to URLhaus in the past three days.',
  });

/** Type definition for {@link RecentUrlsSchemaObject}. */
export type RecentUrlsSchema = {
  /** The URLs, newest first. */
  urls?: RecentUrlSchema[] | null;
};

/**
 * Schema for the recent-URLs feed's `ok` body.
 *
 * @example
 * ```typescript
 * import { RecentUrlsSchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, feed] = RecentUrlsSchemaObject.safeParse({ urls: [] });
 * ```
 */
export const RecentUrlsSchemaObject: BaseGuardian<RecentUrlsSchema> = Guardian
  .object({
    urls: Guardian.array(RecentUrlSchemaObject).nullable().optional(),
  }).passthrough().describe({
    title: 'URLhaus recent URLs',
    description: 'URLs added in the past three days, at most 1,000.',
  });

/** Type definition for {@link RecentPayloadsSchemaObject}. */
export type RecentPayloadsSchema = {
  /** The payloads, newest first. */
  payloads?: PayloadEntrySchema[] | null;
};

/**
 * Schema for the recent-payloads feed's `ok` body.
 *
 * @example
 * ```typescript
 * import { RecentPayloadsSchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, feed] = RecentPayloadsSchemaObject.safeParse({ payloads: [] });
 * ```
 */
export const RecentPayloadsSchemaObject: BaseGuardian<RecentPayloadsSchema> =
  Guardian.object({
    payloads: Guardian.array(PayloadEntrySchemaObject).nullable().optional(),
  }).passthrough().describe({
    title: 'URLhaus recent payloads',
    description: 'Payloads seen in the past three days, at most 1,000.',
  });
