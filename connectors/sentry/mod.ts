/**
 * @module @tundraconnect/sentry
 */

// Export main client class
export { Sentry, type SentryOptions } from './Sentry.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
