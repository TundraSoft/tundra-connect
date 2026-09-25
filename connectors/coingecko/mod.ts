/**
 * Typed, cross-runtime client for the [CoinGecko
 * API](https://www.coingecko.com/en/api).
 *
 * Typed CoinGecko client for the demo and pro tiers: coin prices, market data
 * and the full coin list.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`CoinGeckoError` and its code registry).
 *
 * @example
 * ```ts
 * import { CoinGecko } from '@tundraconnect/coingecko';
 *
 * const client = new CoinGecko();
 *
 * const prices = await client.getPrice({
 *   ids: ['bitcoin', 'ethereum'],
 *   vsCurrencies: 'usd',
 * });
 * console.log(prices.bitcoin?.usd);
 *
 * const markets = await client.getMarkets({ vsCurrency: 'usd', perPage: 10 });
 * console.log(markets[0]?.name, markets[0]?.current_price);
 * ```
 *
 * @module
 */

// Export main client class
export {
  CoinGecko,
  type CoinGeckoAuth,
  type CoinGeckoOptions,
  type GetMarketsOptions,
  type GetPriceOptions,
  type ListCoinsOptions,
} from './CoinGecko.ts';

// Export error handling
export * from './errors/mod.ts';

// Export all schema types and objects for advanced usage
export * from './schema/mod.ts';
