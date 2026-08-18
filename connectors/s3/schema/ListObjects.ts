import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';

/**
 * Schema for a single `<Contents>` entry in a ListObjectsV2 response.
 *
 * @example
 * ```typescript
 * const [error, entry] = S3ObjectSchemaObject.safeParse({
 *   Key: 'photos/2019/vacation.jpg',
 *   LastModified: '2019-06-01T12:00:00.000Z',
 *   ETag: '"9a0364b9e99bb480dd25e1f0284c8555"',
 *   Size: '2048',
 *   StorageClass: 'STANDARD',
 * });
 * ```
 */
type _S3ObjectShape = {
  key: string;
  lastModified: Date;
  etag: string;
  size: number;
  storageClass?: string;
};

const _s3ObjectSchema: BaseGuardian<_S3ObjectShape> = Guardian.object({
  Key: Guardian.string(),
  LastModified: Guardian.date(),
  ETag: Guardian.string(),
  Size: Guardian.number().min(0),
  StorageClass: Guardian.string().optional(),
}).transform((entry) => ({
  key: entry.Key,
  lastModified: entry.LastModified,
  etag: entry.ETag,
  size: entry.Size,
  storageClass: entry.StorageClass,
})).describe({
  title: 'S3 object entry',
  description: 'One `<Contents>` entry from a ListObjectsV2 response.',
});

/** Type definition for {@link S3ObjectSchemaObject}. */
export type S3ObjectSchema = GuardianInfer<typeof _s3ObjectSchema>;

export const S3ObjectSchemaObject: BaseGuardian<S3ObjectSchema> =
  _s3ObjectSchema;

/**
 * Schema for a ListObjectsV2 (`<ListBucketResult>`) response.
 *
 * Wrapped in {@link Guardian.preprocess} to paper over two well-known
 * XML-to-JSON conversion quirks in RESTler's bundled parser
 * (`@libs/xml`), verified empirically against this connect's actual
 * parser output rather than assumed from the XML spec:
 *
 * - A single `<Contents>` element parses to a bare object, not a
 *   one-element array — only 2+ produce an array. Normalized to always
 *   be an array (possibly empty) before {@link Guardian.array} sees it.
 * - An empty element (`<Prefix></Prefix>`) parses to `null`, not `''`.
 *   Normalized to `undefined` so `.optional()` handles it uniformly.
 *
 * @example
 * ```typescript
 * const [error, result] = ListObjectsResponseSchemaObject.safeParse({
 *   Name: 'examplebucket',
 *   IsTruncated: 'false',
 *   Contents: { Key: 'a.txt', LastModified: '2019-01-01T00:00:00.000Z', ETag: '"abc"', Size: '10' },
 * });
 * ```
 */
type _ListObjectsResponseShape = {
  name: string;
  prefix?: string;
  keyCount?: number;
  maxKeys?: number;
  isTruncated: boolean;
  nextContinuationToken?: string;
  contents: _S3ObjectShape[];
};

const _listObjectsResponseSchema: BaseGuardian<_ListObjectsResponseShape> =
  Guardian.preprocess(
    (input: unknown) => {
      if (input === null || typeof input !== 'object') return input;
      const raw = { ...(input as Record<string, unknown>) };
      if (raw.Contents === undefined) {
        raw.Contents = [];
      } else if (!Array.isArray(raw.Contents)) {
        raw.Contents = [raw.Contents];
      }
      if (raw.Prefix === null) {
        raw.Prefix = undefined;
      }
      return raw;
    },
    Guardian.object({
      Name: Guardian.string(),
      Prefix: Guardian.string().optional(),
      KeyCount: Guardian.number().optional(),
      MaxKeys: Guardian.number().optional(),
      IsTruncated: Guardian.boolean(),
      NextContinuationToken: Guardian.string().optional(),
      Contents: Guardian.array(_s3ObjectSchema),
    }).transform((result) => ({
      name: result.Name,
      prefix: result.Prefix,
      keyCount: result.KeyCount,
      maxKeys: result.MaxKeys,
      isTruncated: result.IsTruncated,
      nextContinuationToken: result.NextContinuationToken,
      contents: result.Contents,
    })),
  ).describe({
    title: 'ListObjectsV2 result',
    description:
      'Parsed `<ListBucketResult>` document from a ListObjectsV2 request.',
  });

/** Type definition for {@link ListObjectsResponseSchemaObject}. */
export type ListObjectsResponseSchema = GuardianInfer<
  typeof _listObjectsResponseSchema
>;

export const ListObjectsResponseSchemaObject: BaseGuardian<
  ListObjectsResponseSchema
> = _listObjectsResponseSchema;
