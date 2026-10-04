import { type BaseGuardian, Guardian } from '@guardian';
import {
  type CustomHostnameSslSchema,
  CustomHostnameSslSchemaObject,
} from './CustomHostnameSsl.ts';
import { type ResultInfoSchema, ResultInfoSchemaObject } from './ResultInfo.ts';

/** Every hostname `status` Cloudflare documents. */
export const CUSTOM_HOSTNAME_STATUSES = [
  'active',
  'pending',
  'active_redeploying',
  'moved',
  'pending_deletion',
  'deleted',
  'pending_blocked',
  'pending_migration',
  'pending_provisioned',
  'test_pending',
  'test_active',
  'test_active_apex',
  'test_blocked',
  'test_failed',
  'provisioned',
  'blocked',
] as const;

/**
 * Type definition for {@link CustomHostnameSchemaObject}: a custom hostname
 * as Cloudflare returns it (the unwrapped `result`).
 *
 * Only `id` and `hostname` are required. `status` is typed as `string`
 * (see {@link CUSTOM_HOSTNAME_STATUSES} for the documented values) so a new
 * vendor state never fails a read.
 */
export type CustomHostnameSchema = {
  /** Custom hostname id. */
  id: string;
  /** The customer's hostname, e.g. `app.customer.com`. */
  hostname: string;
  /** Activation status: `pending` until ownership is verified, then `active`. */
  status?: string;
  /** Certificate state; `null` when no certificate was requested. */
  ssl?: CustomHostnameSslSchema | null;
  /** Per-hostname key/value metadata (needs the custom metadata entitlement). */
  custom_metadata?: Record<string, unknown> | null;
  /** Origin this hostname is routed to instead of the fallback origin. */
  custom_origin_server?: string | null;
  /** SNI sent to the custom origin. */
  custom_origin_sni?: string | null;
  /** TXT record the customer publishes to prove ownership (pre-validation). */
  ownership_verification?: {
    type?: string;
    name?: string;
    value?: string;
    [key: string]: unknown;
  } | null;
  /** HTTP token the customer serves to prove ownership (pre-validation). */
  ownership_verification_http?: {
    http_url?: string;
    http_body?: string;
    [key: string]: unknown;
  } | null;
  /** Errors met while activating the hostname. */
  verification_errors?: string[];
  /** ISO 8601 creation time. */
  created_at?: string;
};

/**
 * Schema for one custom hostname in a response. Unknown keys pass through.
 *
 * @example
 * ```typescript
 * import { CustomHostnameSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, hostname] = CustomHostnameSchemaObject.safeParse({
 *   id: '0d89c70d-ad9f-4843-b99f-6cc0252067e9',
 *   hostname: 'app.customer.com',
 *   status: 'pending',
 *   ssl: { type: 'dv', method: 'http', status: 'pending_validation' },
 *   ownership_verification: { type: 'txt', name: '_cf-custom-hostname.app.customer.com', value: '5cc07c04-...' },
 * });
 * ```
 */
export const CustomHostnameSchemaObject: BaseGuardian<CustomHostnameSchema> =
  Guardian.object({
    id: Guardian.string(),
    hostname: Guardian.string(),
    status: Guardian.string().optional(),
    ssl: CustomHostnameSslSchemaObject.nullable().optional(),
    custom_metadata: Guardian.object({}).passthrough().nullable()
      .optional(),
    custom_origin_server: Guardian.string().nullable().optional(),
    custom_origin_sni: Guardian.string().nullable().optional(),
    ownership_verification: Guardian.object({
      type: Guardian.string().optional(),
      name: Guardian.string().optional(),
      value: Guardian.string().optional(),
    }).passthrough().nullable().optional(),
    ownership_verification_http: Guardian.object({
      http_url: Guardian.string().optional(),
      http_body: Guardian.string().optional(),
    }).passthrough().nullable().optional(),
    verification_errors: Guardian.array(Guardian.string()).optional(),
    created_at: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'Custom hostname',
    description:
      'A Cloudflare for SaaS custom hostname: activation status, certificate state, ownership-verification records and origin overrides.',
  });

/** Type definition for {@link CustomHostnamePageSchemaObject}: one page of hostnames. */
export type CustomHostnamePageSchema = {
  /** The hostnames on this page. */
  result: CustomHostnameSchema[];
  /** Paging information, when Cloudflare sent it. */
  result_info?: ResultInfoSchema;
};

/**
 * Schema for a page of custom hostnames — what `listCustomHostnames`
 * resolves to.
 *
 * @example
 * ```typescript
 * import { CustomHostnamePageSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, page] = CustomHostnamePageSchemaObject.safeParse({ result: [] });
 * ```
 */
export const CustomHostnamePageSchemaObject: BaseGuardian<
  CustomHostnamePageSchema
> = Guardian.object({
  result: Guardian.array(CustomHostnameSchemaObject),
  result_info: ResultInfoSchemaObject.optional(),
}).describe({
  title: 'Custom hostname page',
  description: 'One page of custom hostnames with its paging information.',
});
