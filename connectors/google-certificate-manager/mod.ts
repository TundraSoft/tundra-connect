/**
 * Typed, cross-runtime client for the
 * [Google Cloud Certificate Manager
 * API](https://cloud.google.com/certificate-manager/docs/reference/certificate-manager/rest)
 * (v1).
 *
 * Create, read, list and delete Google-managed TLS certificates and
 * certificate map entries, follow the long-running operations they return,
 * and derive valid resource ids from hostnames — with service-account
 * (Web Crypto RS256 JWT) or access-token auth, on Deno, Bun, Node and
 * Cloudflare Workers.
 *
 * Subpaths: `./schemas` (Guardian schemas and types) and `./errors`
 * (`GoogleCertificateManagerError` and its code registry).
 *
 * @example
 * ```ts
 * import {
 *   GoogleCertificateManager,
 *   hostnameToResourceId,
 * } from '@tundraconnect/google-certificate-manager';
 *
 * const client = new GoogleCertificateManager({
 *   auth: {
 *     type: 'CUSTOM',
 *     clientEmail: 'certs@my-project.iam.gserviceaccount.com',
 *     privateKey: '-----BEGIN PRIVATE KEY-----\n...',
 *   },
 *   projectId: 'my-project',
 *   certificateMapId: 'customer-domains',
 * });
 *
 * const id = hostnameToResourceId('go.example.com');
 * await client.waitForOperation(
 *   await client.createCertificate({ certificateId: id, domains: ['go.example.com'] }),
 * );
 * await client.createCertificateMapEntry({
 *   entryId: id,
 *   hostname: 'go.example.com',
 *   certificates: [id],
 * });
 *
 * const certificate = await client.getCertificate(id);
 * console.log(certificate.managed?.state);
 * ```
 *
 * @module
 */

export {
  type CertificateMapEntryOptions,
  type CreateCertificateMapEntryOptions,
  type CreateCertificateOptions,
  GoogleCertificateManager,
  type GoogleCertificateManagerAuth,
  type GoogleCertificateManagerBearerAuth,
  type GoogleCertificateManagerOptions,
  type GoogleCertificateManagerServiceAccountAuth,
  type ListCertificateMapEntriesOptions,
  type ListCertificateMapEntriesResult,
  type ListCertificatesResult,
  type ListOptions,
  type WaitForOperationOptions,
} from './GoogleCertificateManager.ts';
export {
  hostnameToResourceId,
  type HostnameToResourceIdOptions,
  isValidResourceId,
  RESOURCE_ID_PATTERN,
} from './resourceId.ts';
export * from './errors/mod.ts';
export * from './schema/mod.ts';
