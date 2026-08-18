/**
 * @module @tundraconnect/coingecko
 */

// Export main client class
export {
  CoinGecko,
  type CoinGeckoAuth,
  type CoinGeckoOptions,
} from './CoinGecko.ts';

// Export error handling
export * from './errors/mod.ts';

// Export all schema types and objects for advanced usage
export * from './schema/mod.ts';
