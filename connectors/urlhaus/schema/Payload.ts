import { type BaseGuardian, Guardian } from '@guardian';
import { type VirusTotalSchema, VirusTotalSchemaObject } from './Common.ts';

/** Type definition for {@link PayloadUrlSchemaObject} — one URL seen serving a payload. */
export type PayloadUrlSchema = {
  /** URLhaus database id of the URL, as a string. */
  url_id?: string;
  /** The malware URL. */
  url?: string;
  /** `online`, `offline`, or `unknown`. */
  url_status?: string;
  /** Link to the URLhaus entry. */
  urlhaus_reference?: string;
  /** File name the URL served the payload as; otherwise `null`. */
  filename?: string | null;
  /** Date (`YYYY-MM-DD`) first seen on this URL. */
  firstseen?: string | null;
  /** Date (`YYYY-MM-DD`) last seen on this URL; otherwise `null`. */
  lastseen?: string | null;
};

/**
 * Schema for one entry of a payload lookup's `urls` array.
 *
 * @example
 * ```typescript
 * import { PayloadUrlSchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, url] = PayloadUrlSchemaObject.safeParse({
 *   url_id: '105243',
 *   url: 'http://www.mother-earth.net/bn/wp-content/',
 *   url_status: 'offline',
 *   lastseen: null,
 * });
 * ```
 */
export const PayloadUrlSchemaObject: BaseGuardian<PayloadUrlSchema> = Guardian
  .object({
    url_id: Guardian.string().optional(),
    url: Guardian.string().optional(),
    url_status: Guardian.string().optional(),
    urlhaus_reference: Guardian.string().optional(),
    filename: Guardian.string().nullable().optional(),
    firstseen: Guardian.string().nullable().optional(),
    lastseen: Guardian.string().nullable().optional(),
  }).passthrough().describe({
    title: 'URLhaus payload URL',
    description: 'One malware URL observed serving a payload.',
  });

/**
 * Type definition for {@link PayloadEntrySchemaObject} — what URLhaus knows
 * about one file (the `ok` form of `/v1/payload/`, and one entry of the
 * recent-payloads feed).
 *
 * Numeric values (`file_size`, `url_count`) arrive as strings and are kept
 * that way.
 */
export type PayloadEntrySchema = {
  /** MD5 of the file. */
  md5_hash?: string;
  /** SHA-256 of the file. */
  sha256_hash?: string;
  /** File type guessed by URLhaus, e.g. `exe`. */
  file_type?: string;
  /** File size in bytes, as a string. */
  file_size?: string;
  /** Malware family, when known; otherwise `null`. */
  signature?: string | null;
  /** When URLhaus first saw the file. */
  firstseen?: string;
  /** When URLhaus last saw the file; otherwise `null`. */
  lastseen?: string | null;
  /** Number of URLs seen serving the file, as a string. */
  url_count?: string;
  /** Where a copy can be downloaded from URLhaus. */
  urlhaus_download?: string;
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
  /** URLs seen serving the file (max 100). Absent on the recent feed. */
  urls?: PayloadUrlSchema[] | null;
};

/**
 * Schema for a payload lookup's `ok` body, and for one entry of the
 * recent-payloads feed.
 *
 * @example
 * ```typescript
 * import { PayloadEntrySchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, payload] = PayloadEntrySchemaObject.safeParse({
 *   md5_hash: '1585ad28f7d1e0ca696e6c6c2f1d008a',
 *   file_type: 'exe',
 *   signature: 'Heodo',
 *   virustotal: null,
 * });
 * ```
 */
export const PayloadEntrySchemaObject: BaseGuardian<PayloadEntrySchema> =
  Guardian.object({
    md5_hash: Guardian.string().optional(),
    sha256_hash: Guardian.string().optional(),
    file_type: Guardian.string().optional(),
    file_size: Guardian.string().optional(),
    signature: Guardian.string().nullable().optional(),
    firstseen: Guardian.string().optional(),
    lastseen: Guardian.string().nullable().optional(),
    url_count: Guardian.string().optional(),
    urlhaus_download: Guardian.string().optional(),
    virustotal: VirusTotalSchemaObject.nullable().optional(),
    imphash: Guardian.string().nullable().optional(),
    ssdeep: Guardian.string().nullable().optional(),
    tlsh: Guardian.string().nullable().optional(),
    magika: Guardian.string().nullable().optional(),
    urls: Guardian.array(PayloadUrlSchemaObject).nullable().optional(),
  }).passthrough().describe({
    title: 'URLhaus payload entry',
    description: 'What URLhaus knows about one malware file.',
  });
