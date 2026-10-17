import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Documented `managed.state` values. The field is typed open
 * (`| (string & Record<never, never>)`) so a value Google adds later still parses.
 */
export type ManagedCertificateState =
  | 'STATE_UNSPECIFIED'
  | 'PROVISIONING'
  | 'FAILED'
  | 'ACTIVE';

/** Documented `managed.provisioningIssue.reason` values. */
export type ProvisioningIssueReason =
  | 'REASON_UNSPECIFIED'
  | 'AUTHORIZATION_ISSUE'
  | 'RATE_LIMITED';

/** Documented `managed.authorizationAttemptInfo[].state` values. */
export type AuthorizationAttemptState =
  | 'STATE_UNSPECIFIED'
  | 'AUTHORIZING'
  | 'AUTHORIZED'
  | 'FAILED';

/** Documented `managed.authorizationAttemptInfo[].failureReason` values. */
export type AuthorizationFailureReason =
  | 'FAILURE_REASON_UNSPECIFIED'
  | 'CONFIG'
  | 'CAA'
  | 'RATE_LIMITED';

/** Documented certificate `scope` values. */
export type CertificateScope =
  | 'DEFAULT'
  | 'EDGE_CACHE'
  | 'ALL_REGIONS'
  | 'CLIENT_AUTH';

/** Type definition for {@link ProvisioningIssueSchemaObject}. */
export type ProvisioningIssueSchema = {
  /** Why provisioning is stuck or failed. */
  reason?: ProvisioningIssueReason | (string & Record<never, never>);
  /** Human-readable explanation. Not stable — branch on `reason`. */
  details?: string;
};

/**
 * Schema for a managed certificate's `provisioningIssue`.
 *
 * @example
 * ```typescript
 * import { ProvisioningIssueSchemaObject } from '@tundraconnect/google-certificate-manager/schemas';
 *
 * const issue = ProvisioningIssueSchemaObject.parse({
 *   reason: 'AUTHORIZATION_ISSUE',
 *   details: 'Authorization attempt failed for example.com',
 * });
 * ```
 */
export const ProvisioningIssueSchemaObject: BaseGuardian<
  ProvisioningIssueSchema
> = Guardian.object({
  reason: Guardian.string().optional(),
  details: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Provisioning issue',
  description: 'Why a managed certificate is not (yet) provisioned.',
});

/** Type definition for {@link AuthorizationAttemptInfoSchemaObject}. */
export type AuthorizationAttemptInfoSchema = {
  /** The domain this attempt was for. */
  domain?: string;
  /** Authorization state of the domain. */
  state?: AuthorizationAttemptState | (string & Record<never, never>);
  /** Why the attempt failed, when `state` is `FAILED`. */
  failureReason?: AuthorizationFailureReason | (string & Record<never, never>);
  /** Human-readable explanation. Not stable — branch on `failureReason`. */
  details?: string;
};

/**
 * Schema for one entry of a managed certificate's
 * `authorizationAttemptInfo` — the latest authorization attempt for one
 * domain.
 *
 * @example
 * ```typescript
 * import { AuthorizationAttemptInfoSchemaObject } from '@tundraconnect/google-certificate-manager/schemas';
 *
 * const attempt = AuthorizationAttemptInfoSchemaObject.parse({
 *   domain: 'example.com',
 *   state: 'FAILED',
 *   failureReason: 'CONFIG',
 *   details: 'The A record does not point at the load balancer',
 * });
 * ```
 */
export const AuthorizationAttemptInfoSchemaObject: BaseGuardian<
  AuthorizationAttemptInfoSchema
> = Guardian.object({
  domain: Guardian.string().optional(),
  state: Guardian.string().optional(),
  failureReason: Guardian.string().optional(),
  details: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Authorization attempt',
  description: 'State of the latest attempt to authorize one domain.',
});

/** Type definition for {@link ManagedCertificateSchemaObject}. */
export type ManagedCertificateSchema = {
  /** The domains the certificate covers. */
  domains?: string[];
  /** DNS authorization resource names, when DNS authorization is used. */
  dnsAuthorizations?: string[];
  /** CertificateIssuanceConfig resource name, for private PKI certificates. */
  issuanceConfig?: string;
  /** Provisioning state. */
  state?: ManagedCertificateState | (string & Record<never, never>);
  /** Set while provisioning is stuck, or after it failed. */
  provisioningIssue?: ProvisioningIssueSchema;
  /** Latest authorization attempt per domain. */
  authorizationAttemptInfo?: AuthorizationAttemptInfoSchema[];
};

/**
 * Schema for a certificate's `managed` block — its configuration and
 * provisioning state.
 *
 * @example
 * ```typescript
 * import { ManagedCertificateSchemaObject } from '@tundraconnect/google-certificate-manager/schemas';
 *
 * const managed = ManagedCertificateSchemaObject.parse({
 *   domains: ['example.com'],
 *   state: 'PROVISIONING',
 * });
 * ```
 */
export const ManagedCertificateSchemaObject: BaseGuardian<
  ManagedCertificateSchema
> = Guardian.object({
  domains: Guardian.array(Guardian.string()).optional(),
  dnsAuthorizations: Guardian.array(Guardian.string()).optional(),
  issuanceConfig: Guardian.string().optional(),
  state: Guardian.string().optional(),
  provisioningIssue: ProvisioningIssueSchemaObject.optional(),
  authorizationAttemptInfo: Guardian.array(
    AuthorizationAttemptInfoSchemaObject,
  ).optional(),
}).passthrough().describe({
  title: 'Managed certificate',
  description: 'Configuration and state of a Google-managed certificate.',
});

/** Type definition for {@link CertificateSchemaObject}. */
export type CertificateSchema = {
  /** Full resource name: `projects/{project}/locations/{location}/certificates/{id}`. */
  name: string;
  /** Free-text description. */
  description?: string;
  /** RFC 3339 creation time. */
  createTime?: string;
  /** RFC 3339 last-update time. */
  updateTime?: string;
  /** Labels attached to the certificate. */
  labels?: Record<string, string>;
  /** DNS SANs. Before a managed certificate is provisioned, its `managed.domains`. */
  sanDnsnames?: string[];
  /** PEM certificate chain, once issued. */
  pemCertificate?: string;
  /** RFC 3339 expiry time, once issued. */
  expireTime?: string;
  /** Where the certificate can be served. */
  scope?: CertificateScope | (string & Record<never, never>);
  /** Resources using this certificate (map entries, proxies). */
  usedBy?: { name?: string }[];
  /** Set for a Google-managed certificate. */
  managed?: ManagedCertificateSchema;
  /** Set for an uploaded certificate. The key material is input-only. */
  selfManaged?: Record<string, unknown>;
};

/**
 * Schema for a Certificate Manager `Certificate` resource.
 *
 * @example
 * ```typescript
 * import { CertificateSchemaObject } from '@tundraconnect/google-certificate-manager/schemas';
 *
 * const certificate = CertificateSchemaObject.parse({
 *   name: 'projects/my-project/locations/global/certificates/example-com',
 *   managed: { domains: ['example.com'], state: 'ACTIVE' },
 * });
 * console.log(certificate.managed?.state);
 * ```
 */
export const CertificateSchemaObject: BaseGuardian<CertificateSchema> = Guardian
  .object({
    name: Guardian.string().minLength(1),
    description: Guardian.string().optional(),
    createTime: Guardian.string().optional(),
    updateTime: Guardian.string().optional(),
    labels: Guardian.record(Guardian.string()).optional(),
    sanDnsnames: Guardian.array(Guardian.string()).optional(),
    pemCertificate: Guardian.string().optional(),
    expireTime: Guardian.string().optional(),
    scope: Guardian.string().optional(),
    usedBy: Guardian.array(
      Guardian.object({ name: Guardian.string().optional() }).passthrough(),
    ).optional(),
    managed: ManagedCertificateSchemaObject.optional(),
    selfManaged: Guardian.object({}).passthrough().optional(),
  }).passthrough().describe({
    title: 'Certificate',
    description: 'A Certificate Manager TLS certificate.',
  });
