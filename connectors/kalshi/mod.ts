/**
 * @module @tundraconnect/kalshi
 */

// Export main client class
export {
  DEFAULT_CANCEL_BATCH_SIZE,
  Kalshi,
  type KalshiOptions,
} from './Kalshi.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
