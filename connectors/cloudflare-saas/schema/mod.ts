/**
 * Guardian schemas behind `@tundraconnect/cloudflare-saas`: every request
 * and response shape the client validates, each exported as a schema object
 * with its TypeScript type. Use them to validate a payload you stored or
 * received elsewhere, or to type your own code against the client's shapes.
 *
 * @example
 * ```ts
 * import { CustomHostnameSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded custom hostname
 * const [error, hostname] = CustomHostnameSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(hostname.hostname, hostname.status, hostname.ssl?.status);
 * ```
 *
 * @module
 */

export {
  CUSTOM_HOSTNAME_STATUSES,
  type CustomHostnamePageSchema,
  CustomHostnamePageSchemaObject,
  type CustomHostnameSchema,
  CustomHostnameSchemaObject,
} from './CustomHostname.ts';
export {
  type CreateCustomHostnameRequestSchema,
  CreateCustomHostnameRequestSchemaObject,
  type FallbackOriginRequestSchema,
  FallbackOriginRequestSchemaObject,
  MAX_HOSTNAME_LENGTH,
  type SslRequestSchema,
  SslRequestSchemaObject,
  type UpdateCustomHostnameRequestSchema,
  UpdateCustomHostnameRequestSchemaObject,
} from './CustomHostnameRequest.ts';
export {
  BUNDLE_METHODS,
  CERTIFICATE_AUTHORITIES,
  type CertificateSchema,
  CertificateSchemaObject,
  CUSTOM_HOSTNAME_SSL_STATUSES,
  type CustomHostnameSslSchema,
  CustomHostnameSslSchemaObject,
  DCV_METHODS,
  type ValidationRecordSchema,
  ValidationRecordSchemaObject,
} from './CustomHostnameSsl.ts';
export {
  type ErrorEnvelopeSchema,
  ErrorEnvelopeSchemaObject,
  type ErrorItemSchema,
  ErrorItemSchemaObject,
} from './Error.ts';
export {
  FALLBACK_ORIGIN_STATUSES,
  type FallbackOriginSchema,
  FallbackOriginSchemaObject,
} from './FallbackOrigin.ts';
export {
  type ListCustomHostnamesQuerySchema,
  ListCustomHostnamesQuerySchemaObject,
  MAX_HOSTNAMES_PER_PAGE,
  MIN_HOSTNAMES_PER_PAGE,
} from './ListCustomHostnamesQuery.ts';
export {
  type CustomHostnameQuotaSchema,
  CustomHostnameQuotaSchemaObject,
} from './Quota.ts';
export { type ResultInfoSchema, ResultInfoSchemaObject } from './ResultInfo.ts';
