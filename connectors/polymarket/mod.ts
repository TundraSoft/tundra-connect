/**
 * @module @tundraconnect/polymarket
 */

// Export main client class
export {
  CLOB_API,
  DATA_API,
  GAMMA_API,
  type GetFillsOptions,
  type GetOpenOrdersOptions,
  type GetPositionsOptions,
  Polymarket,
  type PolymarketOptions,
  RELAYER_API,
} from './Polymarket.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
