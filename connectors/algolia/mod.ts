/**
 * @module @tundraconnect/algolia
 */

// Export main client class
export {
  Algolia,
  type AlgoliaAuth,
  type AlgoliaOptions,
  type WaitTaskOptions,
} from './Algolia.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
