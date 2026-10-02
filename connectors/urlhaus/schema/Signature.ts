import { type BaseGuardian, Guardian } from '@guardian';
import { type VirusTotalSchema, VirusTotalSchemaObject } from './Common.ts';

/**
 * Type definition for {@link SignatureUrlSchemaObject} — one URL seen
 * serving a payload of the queried malware family.
 */
export type SignatureUrlSchema = {
  /** URLhaus database id of the URL, as a string. */
  url_id?: string;
  /** The malware URL. */
  url?: string;
  /** `online`, `offline`, or `unknown`. */
  url_status?: string;
  /** When first seen. */
  firstseen?: string | null;
  /** When last seen; otherwise `null`. */
  lastseen?: string | null;
  /** File name served; otherwise `null`. */
  filename?: string | null;
  /** File type guessed by URLhaus. */
  file_type?: string;
  /** File size in bytes, as a string. */
  file_size?: string;
  /** MD5 of the file. */
  md5_hash?: string;
  /** SHA-256 of the file. */
  sha256_hash?: string;
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
  /** Link to the URLhaus entry. */
  urlhaus_reference?: string;
  /** Where a copy can be downloaded from URLhaus. */
  urlhaus_download?: string;
};

/**
 * Schema for one entry of a signature lookup's `urls` array.
 *
 * @example
 * ```typescript
 * import { SignatureUrlSchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, url] = SignatureUrlSchemaObject.safeParse({
 *   url_id: '1',
 *   url: 'http://example.test/x.exe',
 *   virustotal: null,
 * });
 * ```
 */
export const SignatureUrlSchemaObject: BaseGuardian<SignatureUrlSchema> =
  Guardian.object({
    url_id: Guardian.string().optional(),
    url: Guardian.string().optional(),
    url_status: Guardian.string().optional(),
    firstseen: Guardian.string().nullable().optional(),
    lastseen: Guardian.string().nullable().optional(),
    filename: Guardian.string().nullable().optional(),
    file_type: Guardian.string().optional(),
    file_size: Guardian.string().optional(),
    md5_hash: Guardian.string().optional(),
    sha256_hash: Guardian.string().optional(),
    virustotal: VirusTotalSchemaObject.nullable().optional(),
    imphash: Guardian.string().nullable().optional(),
    ssdeep: Guardian.string().nullable().optional(),
    tlsh: Guardian.string().nullable().optional(),
    magika: Guardian.string().nullable().optional(),
    urlhaus_reference: Guardian.string().optional(),
    urlhaus_download: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'URLhaus signature URL',
    description: 'One URL serving a payload of the queried malware family.',
  });

/** Type definition for {@link SignatureEntrySchemaObject} (the `ok` form of `/v1/signature/`). */
export type SignatureEntrySchema = {
  /** When the signature was first seen. */
  firstseen?: string;
  /** When the signature was last seen; otherwise `null`. */
  lastseen?: string | null;
  /** Number of URLs, as a string. */
  url_count?: string;
  /** Number of payloads, as a string. */
  payload_count?: string;
  /** URLs serving the family's payloads (max 1000). */
  urls?: SignatureUrlSchema[] | null;
};

/**
 * Schema for a signature lookup's `ok` body.
 *
 * @example
 * ```typescript
 * import { SignatureEntrySchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, family] = SignatureEntrySchemaObject.safeParse({
 *   url_count: '10',
 *   payload_count: '4',
 *   urls: [],
 * });
 * ```
 */
export const SignatureEntrySchemaObject: BaseGuardian<SignatureEntrySchema> =
  Guardian.object({
    firstseen: Guardian.string().optional(),
    lastseen: Guardian.string().nullable().optional(),
    url_count: Guardian.string().optional(),
    payload_count: Guardian.string().optional(),
    urls: Guardian.array(SignatureUrlSchemaObject).nullable().optional(),
  }).passthrough().describe({
    title: 'URLhaus signature entry',
    description:
      'The URLs and payloads URLhaus associates with a malware family.',
  });
