import { type BaseGuardian, Guardian } from '@guardian';

/** Every `ssl.status` Cloudflare documents for a custom hostname certificate. */
export const CUSTOM_HOSTNAME_SSL_STATUSES = [
  'initializing',
  'pending_validation',
  'deleted',
  'pending_issuance',
  'pending_deployment',
  'pending_deletion',
  'pending_expiration',
  'expired',
  'active',
  'initializing_timed_out',
  'validation_timed_out',
  'issuance_timed_out',
  'deployment_timed_out',
  'deletion_timed_out',
  'pending_cleanup',
  'staging_deployment',
  'staging_active',
  'deactivating',
  'inactive',
  'backup_issued',
  'holding_deployment',
] as const;

/** Domain control validation methods. */
export const DCV_METHODS = ['http', 'txt', 'email'] as const;

/** Certificate authorities Cloudflare can order from. */
export const CERTIFICATE_AUTHORITIES = [
  'digicert',
  'google',
  'lets_encrypt',
  'ssl_com',
] as const;

/** Certificate bundle methods. */
export const BUNDLE_METHODS = ['ubiquitous', 'optimal', 'force'] as const;

/**
 * Type definition for {@link ValidationRecordSchemaObject}: what a customer
 * (or you, with DCV delegation) must publish for the CA to validate the
 * hostname. Which fields are present depends on `ssl.method`.
 */
export type ValidationRecordSchema = {
  /** TXT record name, for `method: 'txt'`. */
  txt_name?: string;
  /** TXT record value, for `method: 'txt'`. */
  txt_value?: string;
  /** URL the CA will fetch, for `method: 'http'`. */
  http_url?: string;
  /** Body the CA expects at `http_url`. */
  http_body?: string;
  /** CNAME record name, for DCV delegation. */
  cname?: string;
  /** CNAME target, for DCV delegation. */
  cname_target?: string;
  /** Addresses the CA mails, for `method: 'email'`. */
  emails?: string[];
  /** Status of this record's validation. */
  status?: string;
};

/**
 * Schema for one validation record. Everything is optional and unknown
 * keys pass through.
 *
 * @example
 * ```typescript
 * import { ValidationRecordSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, record] = ValidationRecordSchemaObject.safeParse({
 *   txt_name: '_acme-challenge.app.customer.com',
 *   txt_value: '810b7d5f01154524b961ba0cd578acc2',
 * });
 * ```
 */
export const ValidationRecordSchemaObject: BaseGuardian<
  ValidationRecordSchema
> = Guardian.object({
  txt_name: Guardian.string().optional(),
  txt_value: Guardian.string().optional(),
  http_url: Guardian.string().optional(),
  http_body: Guardian.string().optional(),
  cname: Guardian.string().optional(),
  cname_target: Guardian.string().optional(),
  emails: Guardian.array(Guardian.string()).optional(),
  status: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Validation record',
  description:
    'A DCV record the certificate authority checks: TXT, HTTP, CNAME (delegation) or email.',
});

/**
 * Type definition for {@link CertificateSchemaObject}: one issued
 * certificate in a custom hostname's `ssl.certificates` list. Not in
 * Cloudflare's published schema, but present on live responses once a
 * certificate has been issued, so every field is optional.
 */
export type CertificateSchema = {
  /** Certificate id. */
  id?: string;
  /** Issuing CA. */
  issuer?: string;
  /** Serial number. */
  serial_number?: string;
  /** Signature algorithm, e.g. `ECDSAWithSHA256`. */
  signature?: string;
  /** SHA-256 fingerprint. */
  fingerprint_sha256?: string;
  /** ISO 8601 issue time. */
  issued_on?: string;
  /** ISO 8601 expiry time. */
  expires_on?: string;
};

/**
 * Schema for one issued certificate. Unknown keys pass through.
 *
 * @example
 * ```typescript
 * import { CertificateSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, cert] = CertificateSchemaObject.safeParse({
 *   issuer: 'GoogleTrustServices',
 *   issued_on: '2026-10-04T12:00:00Z',
 *   expires_on: '2027-01-02T12:00:00Z',
 * });
 * ```
 */
export const CertificateSchemaObject: BaseGuardian<CertificateSchema> = Guardian
  .object({
    id: Guardian.string().optional(),
    issuer: Guardian.string().optional(),
    serial_number: Guardian.string().optional(),
    signature: Guardian.string().optional(),
    fingerprint_sha256: Guardian.string().optional(),
    issued_on: Guardian.string().optional(),
    expires_on: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'Certificate',
    description: 'One certificate issued for a custom hostname.',
  });

/**
 * Type definition for {@link CustomHostnameSslSchemaObject}: the `ssl` block
 * of a custom hostname as Cloudflare returns it. Enumerations are typed as
 * `string` so a new vendor value never fails a read; the documented values
 * are exported as constants.
 */
export type CustomHostnameSslSchema = {
  /** Certificate pack id. */
  id?: string;
  /** Always `dv`. */
  type?: string;
  /** DCV method: `http`, `txt` or `email`. */
  method?: string;
  /** One of {@link CUSTOM_HOSTNAME_SSL_STATUSES}. */
  status?: string;
  /** CA the certificate is ordered from. */
  certificate_authority?: string;
  /** Bundle method in use. */
  bundle_method?: string;
  /** Whether the certificate covers `*.hostname` too. */
  wildcard?: boolean;
  /** Hostnames on an uploaded certificate. */
  hosts?: string[];
  /** Issuer of an uploaded certificate. */
  issuer?: string;
  /** Serial number of an uploaded certificate. */
  serial_number?: string;
  /** Signature algorithm of an uploaded certificate. */
  signature?: string;
  /** When an uploaded certificate was uploaded. */
  uploaded_on?: string;
  /** When the certificate expires. Prefer `certificates[0].expires_on`. */
  expires_on?: string;
  /** When the certificate was issued. Prefer `certificates[0].issued_on`. */
  issued_on?: string;
  /** Issued certificates, newest first, once issuance has completed. */
  certificates?: CertificateSchema[];
  /**
   * Older responses carry the DCV TXT record here rather than (or as well
   * as) in `validation_records[]`. Read `validation_records` first.
   */
  txt_name?: string;
  /** See {@link CustomHostnameSslSchema.txt_name}. */
  txt_value?: string;
  /** Older top-level form of `validation_records[].http_url`. */
  http_url?: string;
  /** Older top-level form of `validation_records[].http_body`. */
  http_body?: string;
  /** Older top-level form of `validation_records[].cname`. */
  cname?: string;
  /** Older top-level form of `validation_records[].cname_target`. */
  cname_target?: string;
  /** PEM of an uploaded certificate. */
  custom_certificate?: string;
  /** Key of an uploaded certificate (Cloudflare never echoes the key material). */
  custom_key?: string;
  /** Custom CSR in use. */
  custom_csr_id?: string;
  /** TLS settings (`min_tls_version`, `http2`, `tls_1_3`, `early_hints`, `ciphers`). */
  settings?: Record<string, unknown>;
  /** What must be published for the CA to validate the hostname. */
  validation_records?: ValidationRecordSchema[];
  /** Validation errors reported by the CA. */
  validation_errors?: { message?: string; [key: string]: unknown }[];
  /** DCV delegation records. */
  dcv_delegation_records?: ValidationRecordSchema[];
};

/**
 * Schema for a custom hostname's `ssl` block.
 *
 * @example
 * ```typescript
 * import { CustomHostnameSslSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, ssl] = CustomHostnameSslSchemaObject.safeParse({
 *   id: '0d89c70d-ad9f-4843-b99f-6cc0252067e9',
 *   type: 'dv',
 *   method: 'http',
 *   status: 'pending_validation',
 *   validation_records: [{ http_url: 'http://app.customer.com/.well-known/pki-validation/x.txt', http_body: 'y' }],
 * });
 * ```
 */
export const CustomHostnameSslSchemaObject: BaseGuardian<
  CustomHostnameSslSchema
> = Guardian.object({
  id: Guardian.string().optional(),
  type: Guardian.string().optional(),
  method: Guardian.string().optional(),
  status: Guardian.string().optional(),
  certificate_authority: Guardian.string().optional(),
  bundle_method: Guardian.string().optional(),
  wildcard: Guardian.boolean().strict().optional(),
  hosts: Guardian.array(Guardian.string()).optional(),
  issuer: Guardian.string().optional(),
  serial_number: Guardian.string().optional(),
  signature: Guardian.string().optional(),
  uploaded_on: Guardian.string().optional(),
  expires_on: Guardian.string().optional(),
  issued_on: Guardian.string().optional(),
  certificates: Guardian.array(CertificateSchemaObject).optional(),
  txt_name: Guardian.string().optional(),
  txt_value: Guardian.string().optional(),
  http_url: Guardian.string().optional(),
  http_body: Guardian.string().optional(),
  cname: Guardian.string().optional(),
  cname_target: Guardian.string().optional(),
  custom_certificate: Guardian.string().optional(),
  custom_key: Guardian.string().optional(),
  custom_csr_id: Guardian.string().optional(),
  settings: Guardian.object({}).passthrough().optional(),
  validation_records: Guardian.array(ValidationRecordSchemaObject).optional(),
  validation_errors: Guardian.array(
    Guardian.object({ message: Guardian.string().optional() }).passthrough(),
  ).optional(),
  dcv_delegation_records: Guardian.array(ValidationRecordSchemaObject)
    .optional(),
}).passthrough().describe({
  title: 'Custom hostname SSL',
  description:
    'The certificate state of a custom hostname: DCV method and status, validation records and errors, and the certificate details.',
});
