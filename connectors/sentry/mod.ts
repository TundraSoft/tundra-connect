/**
 * Typed, cross-runtime client for [Sentry's organization/project REST
 * API](https://docs.sentry.io/api/) (`https://sentry.io/api/0/`).
 *
 * Typed Sentry API client: list projects; list, fetch and update issues; read
 * issue events; and create releases.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`SentryError` and its code registry).
 *
 * @example
 * ```ts
 * import { Sentry } from '@tundraconnect/sentry';
 *
 * const client = new Sentry({
 *   auth: { type: 'BEARER', token: 'sntrys_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
 *   organization: 'my-org',
 * });
 *
 * const { issues } = await client.listIssues({ query: 'is:unresolved' });
 * for (const issue of issues) {
 *   console.log(issue.shortId, issue.title, issue.level);
 * }
 * ```
 *
 * @module
 */

// Export main client class
export { Sentry, type SentryAuth, type SentryOptions } from './Sentry.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
