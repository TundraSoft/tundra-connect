/**
 * Typed, cross-runtime client for [Pyth](https://pyth.network) price
 * feeds — currently Pyth Pro (formerly Pyth Lazer) real-time prices over
 * WebSocket, across all of its redundant endpoints at once.
 *
 * Subpaths: `./sockets` (the Pyth Pro socket), `./schemas` (Guardian
 * schemas and inferred types) and `./errors` (`PythError` and its code
 * registry). Hermes (Pyth Core REST and streaming) is planned for this same
 * package.
 *
 * @example
 * ```ts
 * import { PythProSocket } from '@tundraconnect/pyth';
 *
 * const socket = new PythProSocket({
 *   auth: { type: 'BEARER', token: '<access token>' },
 *   subscriptions: [{ symbols: ['Crypto.BTC/USD'] }],
 * });
 * for await (const event of socket) {
 *   if (event.type === 'price') console.log(event.data.price, event.data.exponent);
 * }
 * ```
 *
 * @module
 */

// Export the Pyth Pro WebSocket feed
export * from './socket/mod.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
