import { type BaseGuardian, Guardian } from '@guardian';

/** Type definition for {@link TagUrlSchemaObject} — one URL carrying a tag. */
export type TagUrlSchema = {
  /** URLhaus database id of the URL, as a string. */
  url_id?: string;
  /** The malware URL. */
  url?: string;
  /** `online`, `offline`, or `unknown`. */
  url_status?: string;
  /** When the URL was added. Note the vendor's spelling: `dateadded`. */
  dateadded?: string;
  /** Reporter handle, or `anonymous`. */
  reporter?: string;
  /** The threat — `malware_download`. */
  threat?: string;
  /** Link to the URLhaus entry. */
  urlhaus_reference?: string;
};

/**
 * Schema for one entry of a tag lookup's `urls` array.
 *
 * @example
 * ```typescript
 * import { TagUrlSchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, url] = TagUrlSchemaObject.safeParse({
 *   url_id: '1',
 *   url: 'http://example.test/x.exe',
 *   url_status: 'offline',
 * });
 * ```
 */
export const TagUrlSchemaObject: BaseGuardian<TagUrlSchema> = Guardian.object({
  url_id: Guardian.string().optional(),
  url: Guardian.string().optional(),
  url_status: Guardian.string().optional(),
  dateadded: Guardian.string().optional(),
  reporter: Guardian.string().optional(),
  threat: Guardian.string().optional(),
  urlhaus_reference: Guardian.string().optional(),
}).passthrough().describe({
  title: 'URLhaus tag URL',
  description: 'One malware URL carrying a given tag.',
});

/** Type definition for {@link TagEntrySchemaObject} (the `ok` form of `/v1/tag/`). */
export type TagEntrySchema = {
  /** When the tag was first seen. */
  firstseen?: string;
  /** When the tag was last seen; otherwise `null`. */
  lastseen?: string | null;
  /** Number of URLs carrying the tag, as a string. */
  url_count?: string;
  /** URLs carrying the tag (max 1000). */
  urls?: TagUrlSchema[] | null;
};

/**
 * Schema for a tag lookup's `ok` body.
 *
 * @example
 * ```typescript
 * import { TagEntrySchemaObject } from '@tundraconnect/urlhaus/schemas';
 *
 * const [error, tag] = TagEntrySchemaObject.safeParse({ url_count: '3', urls: [] });
 * ```
 */
export const TagEntrySchemaObject: BaseGuardian<TagEntrySchema> = Guardian
  .object({
    firstseen: Guardian.string().optional(),
    lastseen: Guardian.string().nullable().optional(),
    url_count: Guardian.string().optional(),
    urls: Guardian.array(TagUrlSchemaObject).nullable().optional(),
  }).passthrough().describe({
    title: 'URLhaus tag entry',
    description: 'The malware URLs URLhaus associates with a tag.',
  });
