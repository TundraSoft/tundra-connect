import { type BaseGuardian, Guardian } from '@guardian';

/**
 * The `query_status` values URLhaus documents. Only `ok` and `no_results`
 * are answers; every other value is turned into a `URLhausError` by the
 * client (`invalid_url` → `INVALID_URL`, `invalid_host` → `INVALID_HOST`,
 * `invalid_md5`/`invalid_sha256` → `INVALID_HASH`, `unknown_auth_key` →
 * `AUTH_FAILED`, `http_post_expected`/`http_get_expected` →
 * `INVALID_REQUEST`).
 */
export const URLHAUS_QUERY_STATUSES = [
  'ok',
  'no_results',
  'invalid_url',
  'invalid_host',
  'invalid_md5',
  'invalid_sha256',
  'unknown_auth_key',
  'http_post_expected',
  'http_get_expected',
] as const;

/** Type definition for {@link QueryStatusEnvelopeSchemaObject}. */
export type QueryStatusEnvelopeSchema = {
  /**
   * URLhaus's own outcome — see {@link URLHAUS_QUERY_STATUSES}. Typed as
   * `string` so an undocumented value is reported as itself rather than
   * as a schema failure.
   */
  query_status: string;
};

/**
 * Schema for the one field every URLhaus response carries. The client
 * reads this first, then validates the rest of an `ok` body against the
 * endpoint's own schema.
 *
 * @example
 * ```typescript
 * import { QueryStatusEnvelopeSchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, envelope] = QueryStatusEnvelopeSchemaObject.safeParse({
 *   query_status: 'no_results',
 * });
 * ```
 */
export const QueryStatusEnvelopeSchemaObject: BaseGuardian<
  QueryStatusEnvelopeSchema
> = Guardian.object({
  query_status: Guardian.string(),
}).passthrough().describe({
  title: 'URLhaus query status',
  description: 'The `query_status` field every URLhaus response carries.',
});

/** Type definition for {@link BlacklistsSchemaObject}. */
export type BlacklistsSchema = {
  /**
   * Spamhaus DBL status: `spammer_domain`, `phishing_domain`,
   * `botnet_cc_domain`, `abused_legit_spam`, `abused_legit_malware`,
   * `abused_legit_phishing`, `abused_legit_botnetcc`, `abused_redirector`,
   * or `not listed`.
   */
  spamhaus_dbl?: string;
  /** SURBL status: `listed` or `not listed`. */
  surbl?: string;
};

/**
 * Schema for the third-party blocklist status URLhaus attaches to a URL or
 * host. Absent for an IPv4 host.
 *
 * @example
 * ```typescript
 * import { BlacklistsSchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, lists] = BlacklistsSchemaObject.safeParse({
 *   spamhaus_dbl: 'abused_legit_malware',
 *   surbl: 'listed',
 * });
 * ```
 */
export const BlacklistsSchemaObject: BaseGuardian<BlacklistsSchema> = Guardian
  .object({
    spamhaus_dbl: Guardian.string().optional(),
    surbl: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'URLhaus blacklists',
    description: 'Spamhaus DBL and SURBL status for a URL or host.',
  });

/** Type definition for {@link VirusTotalSchemaObject}. */
export type VirusTotalSchema = {
  /** Detection ratio, e.g. `16 / 58`. */
  result?: string;
  /** Detection percentage as a string, e.g. `27.59`. */
  percent?: string;
  /** Link to the VirusTotal report. */
  link?: string;
};

/**
 * Schema for the VirusTotal summary on a payload. The field itself is
 * `null` when URLhaus has no VirusTotal result.
 *
 * @example
 * ```typescript
 * import { VirusTotalSchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, vt] = VirusTotalSchemaObject.safeParse({
 *   result: '16 / 58',
 *   percent: '27.59',
 *   link: 'https://www.virustotal.com/file/abc/analysis/1/',
 * });
 * ```
 */
export const VirusTotalSchemaObject: BaseGuardian<VirusTotalSchema> = Guardian
  .object({
    result: Guardian.string().optional(),
    percent: Guardian.string().optional(),
    link: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'VirusTotal summary',
    description: 'Detection ratio, percentage and report link for a payload.',
  });
