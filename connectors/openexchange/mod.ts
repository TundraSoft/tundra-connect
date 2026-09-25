/**
 * Typed, cross-runtime client for the [Open Exchange Rates
 * API](https://openexchangerates.org/).
 *
 * Typed Open Exchange Rates client: latest and historical rates, time series,
 * currency conversion, OHLC data and account usage.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`OpenExchangeError` and its code registry).
 *
 * @example
 * ```ts
 * import { OpenExchange } from '@tundraconnect/openexchange';
 *
 * const client = new OpenExchange({
 *   auth: { type: 'CUSTOM', appId: 'your-app-id' },
 * });
 * const rates = await client.getRates({ base: 'USD', symbols: ['EUR'] });
 *
 * console.log(rates.EUR);
 * ```
 *
 * @module
 */

// Export main client class
export {
  OpenExchange,
  type OpenExchangeAuth,
  type OpenExchangeOptions,
} from './OpenExchange.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
