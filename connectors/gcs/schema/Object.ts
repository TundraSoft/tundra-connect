import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for a GCS Object resource.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * ObjectSchemaObject>`) and kept in sync with the field list below: JSR's
 * "slow types" check requires every exported symbol's type to be resolvable
 * without inferring through a generic builder chain, and a type derived
 * from `typeof` an *inferred* (unannotated) `Guardian.object(...)` result
 * still counts as such a chain even when the derivation itself is a
 * one-line alias — see `ObjectSchemaObject`'s explicit annotation below,
 * which is what actually satisfies the check.
 */
export type ObjectSchema = {
  /** Resource kind, always `storage#object`. */
  kind?: string;
  /** Opaque object ID (`bucket/name/generation`). */
  id?: string;
  /** API URL for the object's metadata. */
  selfLink?: string;
  /** API URL to download the object's data (`alt=media`). */
  mediaLink?: string;
  /** Object name (the `key` in this connect's canonical interface). */
  name: string;
  /** Name of the bucket containing the object. */
  bucket: string;
  /** Content generation of the object, as a decimal string. */
  generation?: string;
  /** Metadata generation of the object, as a decimal string. */
  metageneration?: string;
  /** MIME type, as set at upload time or by a later `patch`. */
  contentType?: string;
  /** Content-Length of the object's data, in bytes, as a decimal string. */
  size?: string;
  /** Base64-encoded MD5 hash of the object's data. */
  md5Hash?: string;
  /** Base64-encoded CRC32c checksum of the object's data. */
  crc32c?: string;
  /** HTTP entity tag for the object. */
  etag?: string;
  /** RFC 3339 creation timestamp. */
  timeCreated?: string;
  /** RFC 3339 timestamp of the most recent metadata update. */
  updated?: string;
  /** Storage class applied to the object. */
  storageClass?: string;
  /** User-provided custom metadata, as string key/value pairs. */
  metadata?: Record<string, string>;
};

/**
 * Schema for a GCS JSON API "Object" resource
 *
 * Validates the resource returned by object insert/get/list/patch
 * operations (see
 * https://cloud.google.com/storage/docs/json_api/v1/objects#resource).
 * Only the fields this connect relies on are modelled explicitly; every
 * other documented field (`owner`, `acl`, `retention`, ...) passes through
 * unchanged via `.passthrough()`.
 *
 * `size` is intentionally kept as a `string` — GCS returns object size as a
 * decimal string (an int64) precisely because it can exceed
 * `Number.MAX_SAFE_INTEGER`; parsing it to a `number` here would silently
 * lose precision for very large objects.
 *
 * @example
 * ```typescript
 * const resource = {
 *   kind: 'storage#object',
 *   name: 'reports/2024-01.csv',
 *   bucket: 'my-bucket',
 *   contentType: 'text/csv',
 *   size: '1024',
 *   etag: 'CJqk3aWk0YQDEAE=',
 * };
 *
 * const [error, object] = ObjectSchemaObject.safeParse(resource);
 * if (!error) {
 *   console.log(object.name, object.size);
 * }
 * ```
 */
export const ObjectSchemaObject: BaseGuardian<ObjectSchema> = Guardian.object({
  kind: Guardian.string().optional(),
  id: Guardian.string().optional(),
  selfLink: Guardian.string().optional(),
  mediaLink: Guardian.string().optional(),
  name: Guardian.string(),
  bucket: Guardian.string(),
  generation: Guardian.string().optional(),
  metageneration: Guardian.string().optional(),
  contentType: Guardian.string().optional(),
  size: Guardian.string().optional(),
  md5Hash: Guardian.string().optional(),
  crc32c: Guardian.string().optional(),
  etag: Guardian.string().optional(),
  timeCreated: Guardian.string().optional(),
  updated: Guardian.string().optional(),
  storageClass: Guardian.string().optional(),
  metadata: Guardian.record(Guardian.string(), Guardian.string()).optional(),
}).passthrough().describe({
  title: 'GCS Object resource',
  description:
    'A GCS JSON API Object resource — the metadata envelope returned by insert/get/list/patch.',
});
