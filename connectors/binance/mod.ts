/**
 * Typed, cross-runtime client for [Binance](https://www.binance.com)
 * spot market data — real-time WebSocket streams of raw trades, best
 * bid/ask and full-depth order-book diffs.
 *
 * Subpaths: `./sockets` (the market-data socket), `./schemas` (Guardian
 * schemas and inferred types) and `./errors` (`BinanceError` and its code
 * registry). REST market data, account and order endpoints are planned and
 * will be added to this same package.
 *
 * @example
 * ```ts
 * import { BinanceMarketSocket } from '@tundraconnect/binance';
 *
 * const socket = new BinanceMarketSocket({
 *   streams: { trade: ['BTCUSDT'], bookTicker: ['BTCUSDT'] },
 * });
 * for await (const event of socket) {
 *   if (event.type === 'trade') console.log(event.data.price, event.data.tradeTime);
 * }
 * ```
 *
 * @module
 */

// Export the market-data WebSocket feed
export * from './socket/mod.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
