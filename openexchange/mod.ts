// Export main client class
export { OpenExchange, type OpenExchangeOptions } from './OpenExchange.ts';

// Export error handling
export {
  OpenExchangeError,
  OpenExchangeErrorCodes,
} from './OpenExchangeError.ts';

// Export all schema types and objects for advanced usage
export {
  type ConvertRequestSchema,
  ConvertRequestSchemaObject,
  type HistoricalRatesSchema,
  HistoricalRatesSchemaObject,
  type LatestRatesSchema,
  LatestRatesSchemaObject,
  type OHLCDataSchema,
  OHLCDataSchemaObject,
  type OHLCSchema,
  OHLCSchemaObject,
  type TimeSeriesSchema,
  TimeSeriesSchemaObject,
} from './schema/mod.ts';
