import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';

/**
 * Shared Guardian components reused across the S3 request/response
 * schemas: bucket/key name guards and the object-metadata shape common
 * to {@link GetObject.ts} and {@link HeadObject.ts} (both derive their
 * result entirely from response headers, S3 sets no response body on
 * either).
 */

const _bucketGuard = Guardian.string().minLength(1).describe({
  title: 'Bucket name',
  description: 'Name of the S3 (or S3-compatible) bucket.',
});

/** Validates an S3 bucket name is present. AWS additionally requires 3-63 characters and DNS-label charset; not enforced here so S3-compatible vendors (MinIO, R2) with looser naming still validate. */
export const bucketGuard: BaseGuardian<string> = _bucketGuard;

const _keyGuard = Guardian.string().minLength(1).describe({
  title: 'Object key',
  description: 'Key identifying the object within its bucket.',
});

/** Validates an S3 object key is present. */
export const keyGuard: BaseGuardian<string> = _keyGuard;

const _etagGuard = Guardian.string().describe({
  title: 'ETag',
  description: 'Entity tag identifying a specific object version/content.',
});

/** Validates an ETag value (typically a quoted MD5 hex digest, but opaque per the S3 API contract). */
export const etagGuard: BaseGuardian<string> = _etagGuard;

const _metadataGuard = Guardian.record(Guardian.string()).describe({
  title: 'Object metadata',
  description:
    'User-defined metadata, one entry per `x-amz-meta-*` header (name without the prefix).',
});

/** Validates a `x-amz-meta-*`-derived user metadata map. */
export const metadataGuard: BaseGuardian<Record<string, string>> =
  _metadataGuard;

type _ObjectMetadataShape = {
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
  versionId?: string;
  metadata?: Record<string, string>;
};

const _objectMetadataSchema: BaseGuardian<_ObjectMetadataShape> = Guardian
  .object({
    contentType: Guardian.string().optional().describe({
      description: 'Value of the `Content-Type` response header.',
    }),
    contentLength: Guardian.number().min(0).optional().describe({
      description: 'Value of the `Content-Length` response header, in bytes.',
    }),
    etag: _etagGuard.optional(),
    lastModified: Guardian.date().optional().describe({
      description: 'Value of the `Last-Modified` response header.',
    }),
    versionId: Guardian.string().optional().describe({
      description:
        'Value of the `x-amz-version-id` response header, when versioning is enabled.',
    }),
    metadata: _metadataGuard.optional(),
  }).describe({
    title: 'Object metadata',
    description:
      'Header-derived metadata shared by GetObject and HeadObject responses.',
  });

/** Type definition for {@link ObjectMetadataSchemaObject}. */
export type ObjectMetadataSchema = GuardianInfer<
  typeof _objectMetadataSchema
>;

/** Metadata common to a GetObject/HeadObject response — every field is read from a response header, none from a body. */
export const ObjectMetadataSchemaObject: BaseGuardian<ObjectMetadataSchema> =
  _objectMetadataSchema;
