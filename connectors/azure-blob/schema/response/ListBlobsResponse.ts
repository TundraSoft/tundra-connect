import { type BaseGuardian, Guardian } from '@guardian';
import { type BlobItemSchema, BlobItemSchemaObject } from '../common/mod.ts';

/**
 * RESTler auto-parses an `application/xml` List Blobs response into an
 * object shaped like:
 *
 * ```jsonc
 * {
 *   "EnumerationResults": {
 *     "@ContainerName": "mycontainer",
 *     "Prefix": "foo/",       // or null when empty
 *     "Blobs": {
 *       // a single <Blob> flattens to an object; two or more become an
 *       // array — this ambiguity is normalized away below.
 *       "Blob": { "Name": "...", "Properties": { "Last-Modified": "...", ... } }
 *     },
 *     "NextMarker": null       // or the opaque continuation token string
 *   }
 * }
 * ```
 *
 * (verified directly against `@libs/xml`'s `parse()` — the parser RESTler
 * bundles — rather than assumed from the XSD). This preprocessor flattens
 * that shape into `{ blobs: BlobItemSchema[], nextMarker?: string }` before
 * the inner schema validates the normalized fields.
 */
function toArray(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Shape of a normalized Azure Blob Storage List Blobs response.
 *
 * Written out by hand (rather than derived via `GuardianInfer<typeof
 * ListBlobsResponseSchemaObject>`) so `ListBlobsResponseSchemaObject` below
 * can carry an explicit `BaseGuardian<ListBlobsResponseSchema>` annotation
 * without a circular reference — see `CONVENTIONS.md`'s JSR "slow types"
 * note.
 */
export type ListBlobsResponseSchema = {
  blobs: BlobItemSchema[];
  /**
   * Opaque continuation token — pass verbatim as `continuationToken` on
   * the next `listObjects()` call. Absent when the listing is complete.
   */
  nextMarker?: string;
};

/**
 * Schema for a normalized Azure Blob Storage List Blobs response.
 *
 * Tolerant of the elements the XML parser drops or nulls (an empty
 * `<Blobs/>`, a single `<Blob>` parsed as a bare object, an empty
 * `<NextMarker/>`), but strict about the `<EnumerationResults>` root: a body
 * without one fails validation instead of reading as an empty container.
 *
 * @example
 * ```typescript
 * import { ListBlobsResponseSchemaObject } from '@tundraconnect/azure-blob/schemas';
 *
 * // `raw` is RESTler's already-XML-parsed response body.
 * declare const raw: unknown;
 * const { blobs, nextMarker } = ListBlobsResponseSchemaObject.parse(raw);
 * ```
 */
export const ListBlobsResponseSchemaObject: BaseGuardian<
  ListBlobsResponseSchema
> = Guardian.preprocess(
  (raw) => {
    // Every List Blobs response has an <EnumerationResults> root — even an
    // empty container's (the XML parser turns an empty root into `null`,
    // which is fine). A body with no such root at all is not a List Blobs
    // response: pass it through untouched so the schema rejects it, rather
    // than letting the defaults below read it as an empty container.
    if (
      raw === null || typeof raw !== 'object' ||
      !('EnumerationResults' in raw)
    ) {
      return raw;
    }
    const doc = raw as Record<string, unknown>;
    const enumeration = (doc.EnumerationResults ?? {}) as Record<
      string,
      unknown
    >;
    const blobsNode = (enumeration.Blobs ?? {}) as Record<string, unknown>;
    const blobs = toArray(blobsNode.Blob).map((entry) => {
      const blob = (entry ?? {}) as Record<string, unknown>;
      const properties = (blob.Properties ?? {}) as Record<string, unknown>;
      return {
        name: blob.Name,
        lastModified: properties['Last-Modified'],
        etag: properties['Etag'],
        contentLength: properties['Content-Length'],
        contentType: properties['Content-Type'],
      };
    });
    return {
      blobs,
      // Empty <NextMarker/> means the listing is complete; RESTler's XML
      // parser flattens an empty element to `null`.
      nextMarker: toOptionalString(enumeration.NextMarker),
    };
  },
  Guardian.object({
    blobs: Guardian.array(BlobItemSchemaObject),
    /**
     * Opaque continuation token — pass verbatim as `continuationToken` on
     * the next `listObjects()` call. Absent when the listing is complete.
     */
    nextMarker: Guardian.string().optional(),
  }).describe({
    title: 'Azure Blob Storage List Blobs response',
    description:
      'Normalized <EnumerationResults> XML from the List Blobs operation.',
  }),
);
