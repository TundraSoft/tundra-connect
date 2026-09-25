import { type BaseGuardian, Guardian } from '@guardian';
import { type ObjectSchema, ObjectSchemaObject } from './Object.ts';

/**
 * Type definition for a GCS `objects.list` response page.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * ListObjectsResponseSchemaObject>`) and kept in sync with the field list
 * below: JSR's "slow types" check requires every exported symbol's type to
 * be resolvable without inferring through a generic builder chain, and a
 * type derived from `typeof` an *inferred* (unannotated)
 * `Guardian.object(...)` result still counts as such a chain even when the
 * derivation itself is a one-line alias — see
 * `ListObjectsResponseSchemaObject`'s explicit annotation below, which is
 * what actually satisfies the check.
 */
export type ListObjectsResponseSchema = {
  /** Resource kind, always `storage#objects`. */
  kind?: string;
  /** Matching objects. Omitted (not `[]`) by GCS when there are none. */
  items?: ObjectSchema[];
  /** Opaque token to fetch the next page, when more results exist. */
  nextPageToken?: string;
  /** Distinct path segments when the request used `delimiter`. */
  prefixes?: string[];
};

/**
 * Schema for the GCS JSON API `objects.list` response
 *
 * Validates `GET /storage/v1/b/{bucket}/o`. GCS omits `items` entirely
 * (rather than returning an empty array) when a bucket/prefix has no
 * matching objects — that is modelled as `.optional()` here; the `GCS`
 * client's `listObjects()` normalises a missing `items` to an empty array.
 *
 * @example
 * ```typescript
 * const page = {
 *   kind: 'storage#objects',
 *   items: [{ name: 'a.txt', bucket: 'my-bucket' }],
 *   nextPageToken: 'CgJhLnR4dA==',
 * };
 *
 * const [error, parsed] = ListObjectsResponseSchemaObject.safeParse(page);
 * if (!error) {
 *   console.log(parsed.items?.length, parsed.nextPageToken);
 * }
 * ```
 */
export const ListObjectsResponseSchemaObject: BaseGuardian<
  ListObjectsResponseSchema
> = Guardian.object({
  kind: Guardian.string().optional(),
  items: Guardian.array(ObjectSchemaObject).optional(),
  nextPageToken: Guardian.string().optional(),
  prefixes: Guardian.array(Guardian.string()).optional(),
}).passthrough().describe({
  title: 'GCS objects.list response',
  description: 'A page of Object resources returned by `objects.list`.',
});
