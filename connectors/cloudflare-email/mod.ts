/**
 * @module @tundraconnect/cloudflare-email
 */

// Export main client class
export {
  CloudflareEmail,
  type CloudflareEmailOptions,
} from './CloudflareEmail.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
