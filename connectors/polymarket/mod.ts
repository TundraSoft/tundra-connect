/**
 * Typed, cross-runtime client for [Polymarket](https://polymarket.com)'s two
 * public REST APIs: **Gamma** (market discovery — no auth) and the **CLOB**
 * (trading — L1/L2 auth, real secp256k1/EIP-712 order signing).
 *
 * Typed Polymarket client: Gamma market discovery, CLOB trading with
 * secp256k1/EIP-712 order signing, portfolio positions and value, and gasless
 * split/merge/redeem.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`PolymarketError` and its code registry).
 *
 * @example
 * ```ts
 * import { Polymarket } from '@tundraconnect/polymarket';
 *
 * // Gamma only — no wallet needed.
 * const gamma = new Polymarket({});
 * const { markets } = await gamma.getMarkets({ closed: false, limit: 20 });
 * const market = markets[0];
 * console.log(market?.question, market?.clobTokenIds);
 *
 * // CLOB trading.
 * const clob = new Polymarket({
 *   auth: {
 *     type: 'CUSTOM',
 *     privateKey: Deno.env.get('CONNECTOR_POLYMARKET_PRIVATE_KEY')!,
 *     funder: Deno.env.get('CONNECTOR_POLYMARKET_FUNDER')!,
 *   },
 * });
 * await clob.deriveApiCredentials();
 * const balance = await clob.getBalance();
 * console.log('USDC available:', balance.balance);
 *
 * // Portfolio: open orders and fills (CLOB), positions and value (Data API).
 * const { data: openOrders } = await clob.getOpenOrders();
 * const positions = await clob.getPositions();
 * console.log(
 *   openOrders.length,
 *   'resting orders,',
 *   positions.length,
 *   'positions',
 * );
 *
 * const tokenId = market!.clobTokenIds[0]!;
 * const result = await clob.submitOrder({
 *   tokenId,
 *   side: 'BUY',
 *   price: 0.55,
 *   shares: 9.0,
 *   orderType: 'FAK',
 * });
 * if (result.filled) {
 *   console.log(
 *     `filled: spent ${result.makingAmount} for ${result.takingAmount} shares`,
 *   );
 *   console.log('slippage vs. the requested price:', result.slippage);
 * } else if (result.noMatch) {
 *   console.log('no resting liquidity matched — nothing was spent');
 * }
 *
 * // Kill switch: every resting order, all markets, one request.
 * await clob.cancelAllOrders();
 *
 * // order() dispatches BUY/SELL/SPLIT/MERGE/REDEEM to the right call above and
 * // always returns the same OrderResult shape.
 * await clob.order({
 *   action: 'BUY',
 *   tokenId,
 *   price: 0.55,
 *   shares: 9.0,
 *   orderType: 'FAK',
 * });
 * ```
 *
 * @module
 */

// Export main client class
export {
  type BulkOrderInput,
  CLOB_API,
  DATA_API,
  GAMMA_API,
  type GetFillsOptions,
  type GetMarketsOptions,
  type GetMarketsResult,
  type GetOpenOrdersOptions,
  type GetPositionsOptions,
  type OrderAction,
  type OrderRequest,
  type OrderResult,
  Polymarket,
  type PolymarketAuth,
  type PolymarketOptions,
  RELAYER_API,
  type SubmitOrderOptions,
} from './Polymarket.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
export type { ProtocolVersion } from './PolymarketOrder.ts';
export type { OrderSide } from './PolymarketOrder.ts';
