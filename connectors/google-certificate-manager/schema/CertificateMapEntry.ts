import { type BaseGuardian, Guardian } from '@guardian';

/** Documented certificate map entry `state` values. */
export type CertificateMapEntryState =
  | 'SERVING_STATE_UNSPECIFIED'
  | 'ACTIVE'
  | 'PENDING';

/** Type definition for {@link CertificateMapEntrySchemaObject}. */
export type CertificateMapEntrySchema = {
  /**
   * Full resource name:
   * `projects/{project}/locations/{location}/certificateMaps/{map}/certificateMapEntries/{id}`.
   */
  name: string;
  /** Free-text description. */
  description?: string;
  /** RFC 3339 creation time. */
  createTime?: string;
  /** RFC 3339 last-update time. */
  updateTime?: string;
  /** Labels attached to the entry. */
  labels?: Record<string, string>;
  /** Full resource names of the certificates served for this entry (up to four). */
  certificates?: string[];
  /** Serving state. `PENDING` while the change propagates to Google's frontends. */
  state?: CertificateMapEntryState | (string & Record<never, never>);
  /** The SNI hostname (or `*.example.com` wildcard) this entry matches. */
  hostname?: string;
  /** A predefined matcher instead of a hostname (`PRIMARY`). */
  matcher?: string;
};

/**
 * Schema for a Certificate Manager `CertificateMapEntry` resource.
 *
 * @example
 * ```typescript
 * import { CertificateMapEntrySchemaObject } from '@tundraconnect/google-certificate-manager/schemas';
 *
 * const entry = CertificateMapEntrySchemaObject.parse({
 *   name: 'projects/my-project/locations/global/certificateMaps/main/certificateMapEntries/example-com',
 *   hostname: 'example.com',
 *   certificates: ['projects/my-project/locations/global/certificates/example-com'],
 *   state: 'ACTIVE',
 * });
 * ```
 */
export const CertificateMapEntrySchemaObject: BaseGuardian<
  CertificateMapEntrySchema
> = Guardian.object({
  name: Guardian.string().minLength(1),
  description: Guardian.string().optional(),
  createTime: Guardian.string().optional(),
  updateTime: Guardian.string().optional(),
  labels: Guardian.record(Guardian.string()).optional(),
  certificates: Guardian.array(Guardian.string()).optional(),
  state: Guardian.string().optional(),
  hostname: Guardian.string().optional(),
  matcher: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Certificate map entry',
  description:
    'Binds a hostname (SNI) in a certificate map to the certificates served for it.',
});
