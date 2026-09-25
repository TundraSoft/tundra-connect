/**
 * Typed, cross-runtime client for [Kalshi](https://kalshi.com)'s CFTC-regulated
 * event-contract REST API (`/trade-api/v2`) — public market discovery plus
 * RSA-PSS-authenticated trading, on one shared host.
 *
 * Typed Kalshi client: public market data, plus RSA-PSS-signed trading —
 * balance, positions, fills and orders; place, amend and cancel orders.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`KalshiError` and its code registry).
 *
 * @example
 * ```ts
 * import { Kalshi } from '@tundraconnect/kalshi';
 *
 * // Market data only — no credentials needed.
 * const markets = new Kalshi({});
 * const { markets: page } = await markets.getMarkets({
 *   status: 'open',
 *   limit: 20,
 * });
 * const market = page[0];
 * console.log(market?.ticker, market?.yesBid, market?.yesAsk);
 *
 * // Trading — auth.privateKeyPem is the PKCS#8 PEM from Kalshi's API-key settings.
 * const client = new Kalshi({
 *   auth: {
 *     type: 'CUSTOM',
 *     accessKey: Deno.env.get('CONNECTOR_KALSHI_ACCESS_KEY')!,
 *     privateKeyPem: Deno.env.get('CONNECTOR_KALSHI_PRIVATE_KEY_PEM')!,
 *   },
 * });
 * const balance = await client.getBalance();
 * console.log('available cents:', balance.balance);
 *
 * const result = await client.submitOrder({
 *   ticker: market!.ticker,
 *   side: 'BUY',
 *   price: 0.42,
 *   count: 3,
 *   orderType: 'GTC',
 * });
 * if (result.filled) {
 *   console.log(`filled ${result.filledCount} at ${result.actualPrice}`);
 * }
 * ```
 *
 * @module
 */

// Export main client class
export {
  type AmendOrderOptions,
  type BulkOrderInput,
  DEFAULT_CANCEL_BATCH_SIZE,
  type GetEventsOptions,
  type GetFillsOptions,
  type GetOrdersOptions,
  type GetPositionsOptions,
  type GetTradesOptions,
  Kalshi,
  type KalshiAuth,
  type KalshiOptions,
  type OrderResult,
  type OrderSide,
  type SubmitOrderOptions,
} from './Kalshi.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
