import { type BaseGuardian, Guardian } from '@guardian';
import {
  BUNDLE_METHODS,
  CERTIFICATE_AUTHORITIES,
  DCV_METHODS,
} from './CustomHostnameSsl.ts';

/** Longest hostname Cloudflare accepts. */
export const MAX_HOSTNAME_LENGTH = 255;

/**
 * A hostname: dot-separated labels of letters, digits and hyphens, with an
 * optional leading `*.` for a wildcard. Cloudflare additionally rejects IP
 * addresses, reserved TLDs and `example.*`; those come back as
 * `INVALID_HOSTNAME`.
 */
const HOSTNAME =
  /^(\*\.)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

const hostnameGuardian = (field: string) =>
  Guardian.string().notEmpty(`\`${field}\` cannot be empty`).maxLength(
    MAX_HOSTNAME_LENGTH,
    `\`${field}\` cannot exceed ${MAX_HOSTNAME_LENGTH} characters`,
  ).pattern(
    HOSTNAME,
    `\`${field}\` must be a hostname such as app.customer.com`,
  );

const onOff = Guardian.enum(['on', 'off'] as const);

/**
 * Type definition for {@link SslRequestSchemaObject}: the `ssl` block of a
 * create or update request, with Cloudflare's own field names.
 */
export type SslRequestSchema = {
  /** DCV method. `http` needs no customer action once DNS points at you; `txt` works before DNS changes. */
  method?: typeof DCV_METHODS[number];
  /** Validation level; Cloudflare only supports `dv`. */
  type?: 'dv';
  /** How to bundle the certificate. @default ubiquitous */
  bundle_method?: typeof BUNDLE_METHODS[number];
  /** CA to order from (Enterprise, or where the plan allows). */
  certificate_authority?: typeof CERTIFICATE_AUTHORITIES[number];
  /** Add Cloudflare branding so hostnames over 64 characters fit the CN. */
  cloudflare_branding?: boolean;
  /** PEM of an uploaded certificate (Enterprise). */
  custom_certificate?: string;
  /** Key of an uploaded certificate (Enterprise). */
  custom_key?: string;
  /** One or two uploaded certificate/key pairs (Enterprise). */
  custom_cert_bundle?: { custom_certificate: string; custom_key: string }[];
  /** Custom CSR to use (Enterprise). */
  custom_csr_id?: string;
  /** Also cover `*.hostname` (Enterprise). */
  wildcard?: boolean;
  /** TLS settings for this hostname. */
  settings?: {
    ciphers?: string[];
    early_hints?: 'on' | 'off';
    http2?: 'on' | 'off';
    min_tls_version?: '1.0' | '1.1' | '1.2' | '1.3';
    tls_1_3?: 'on' | 'off';
  };
};

/**
 * Schema for the `ssl` block of a request.
 *
 * @example
 * ```typescript
 * import { SslRequestSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, ssl] = SslRequestSchemaObject.safeParse({
 *   method: 'txt',
 *   type: 'dv',
 *   settings: { min_tls_version: '1.2' },
 * });
 * ```
 */
export const SslRequestSchemaObject: BaseGuardian<SslRequestSchema> = Guardian
  .object({
    method: Guardian.enum(DCV_METHODS).optional(),
    type: Guardian.literal('dv').optional(),
    bundle_method: Guardian.enum(BUNDLE_METHODS).optional(),
    certificate_authority: Guardian.enum(CERTIFICATE_AUTHORITIES).optional(),
    cloudflare_branding: Guardian.boolean().strict().optional(),
    custom_certificate: Guardian.string().optional(),
    custom_key: Guardian.string().optional(),
    custom_cert_bundle: Guardian.array(
      Guardian.object({
        custom_certificate: Guardian.string().notEmpty(),
        custom_key: Guardian.string().notEmpty(),
      }),
    ).optional(),
    custom_csr_id: Guardian.string().optional(),
    wildcard: Guardian.boolean().strict().optional(),
    settings: Guardian.object({
      ciphers: Guardian.array(Guardian.string()).optional(),
      early_hints: onOff.optional(),
      http2: onOff.optional(),
      min_tls_version: Guardian.enum(['1.0', '1.1', '1.2', '1.3'] as const)
        .optional(),
      tls_1_3: onOff.optional(),
    }).optional(),
  }).describe({
    title: 'SSL request',
    description:
      'Certificate options for a custom hostname: DCV method, CA, bundle method, uploaded certificate and TLS settings.',
  });

/**
 * Type definition for {@link CreateCustomHostnameRequestSchemaObject}.
 *
 * When `ssl` is omitted the client sends `{ method: 'http', type: 'dv' }`,
 * which is what the dashboard does — a custom hostname without a
 * certificate is almost never what a SaaS platform wants.
 */
export type CreateCustomHostnameRequestSchema = {
  /** The customer's hostname, e.g. `app.customer.com` (or `*.customer.com`). */
  hostname: string;
  /** Certificate options. @default { method: 'http', type: 'dv' } */
  ssl?: SslRequestSchema;
  /** Per-hostname key/value metadata, readable in Workers (needs the entitlement). */
  custom_metadata?: Record<string, unknown>;
  /** Route this hostname to a different origin than the fallback origin (needs the entitlement). */
  custom_origin_server?: string;
  /** SNI to send to the custom origin. */
  custom_origin_sni?: string;
};

/**
 * Schema for a `createCustomHostname` request.
 *
 * @example
 * ```typescript
 * import { CreateCustomHostnameRequestSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, request] = CreateCustomHostnameRequestSchemaObject.safeParse({
 *   hostname: 'app.customer.com',
 *   ssl: { method: 'http', type: 'dv' },
 * });
 * ```
 */
export const CreateCustomHostnameRequestSchemaObject: BaseGuardian<
  CreateCustomHostnameRequestSchema
> = Guardian.object({
  hostname: hostnameGuardian('hostname'),
  ssl: SslRequestSchemaObject.optional(),
  custom_metadata: Guardian.object({}).passthrough().optional(),
  custom_origin_server: hostnameGuardian('custom_origin_server').optional(),
  custom_origin_sni: hostnameGuardian('custom_origin_sni').optional(),
}).describe({
  title: 'Create custom hostname request',
  description:
    'The hostname to add, with optional certificate options, metadata and origin overrides.',
});

/**
 * Type definition for {@link UpdateCustomHostnameRequestSchemaObject}: the
 * fields of a custom hostname that can change. Re-sending `ssl` with the
 * same `method`/`type` asks Cloudflare to retry validation.
 */
export type UpdateCustomHostnameRequestSchema = Omit<
  CreateCustomHostnameRequestSchema,
  'hostname'
>;

/**
 * Schema for an `updateCustomHostname` request. The client requires at
 * least one field.
 *
 * @example
 * ```typescript
 * import { UpdateCustomHostnameRequestSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, changes] = UpdateCustomHostnameRequestSchemaObject.safeParse({
 *   ssl: { method: 'txt', type: 'dv' },
 * });
 * ```
 */
export const UpdateCustomHostnameRequestSchemaObject: BaseGuardian<
  UpdateCustomHostnameRequestSchema
> = Guardian.object({
  ssl: SslRequestSchemaObject.optional(),
  custom_metadata: Guardian.object({}).passthrough().optional(),
  custom_origin_server: hostnameGuardian('custom_origin_server').optional(),
  custom_origin_sni: hostnameGuardian('custom_origin_sni').optional(),
}).describe({
  title: 'Update custom hostname request',
  description:
    'Certificate options, metadata and origin overrides to change on an existing custom hostname.',
});

/** Type definition for {@link FallbackOriginRequestSchemaObject}. */
export type FallbackOriginRequestSchema = {
  /** The origin hostname custom hostnames are routed to; must be a DNS record in this zone. */
  origin: string;
};

/**
 * Schema for a `setFallbackOrigin` request.
 *
 * @example
 * ```typescript
 * import { FallbackOriginRequestSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, request] = FallbackOriginRequestSchemaObject.safeParse({
 *   origin: 'fallback.example.com',
 * });
 * ```
 */
export const FallbackOriginRequestSchemaObject: BaseGuardian<
  FallbackOriginRequestSchema
> = Guardian.object({
  origin: hostnameGuardian('origin'),
}).describe({
  title: 'Fallback origin request',
  description: 'The origin hostname to route custom hostnames to.',
});
