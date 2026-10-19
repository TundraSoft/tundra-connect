/**
 * WebSocket feeds for Polymarket, importable without the REST client:
 *
 * - {@link PolymarketMarketSocket} — public order books (full-depth
 *   snapshots + every level change), trades and tick-size changes.
 * - {@link PolymarketUserSocket} — the account's own orders and trades,
 *   authenticated with the same CLOB API credentials as the REST client.
 * - {@link PolymarketPriceSocket} — PolyBolt reference prices (Chainlink/Pyth
 *   crypto, equities, TWAPs) and Polymarket top-of-book.
 * - {@link PolymarketLiveDataSocket} — the legacy real-time data socket's
 *   Chainlink and Binance crypto prices.
 *
 * Each socket is an async iterable of typed, Guardian-validated events plus
 * lifecycle events (`connected`, `disconnected`, `gap`, `error`,
 * `invalid`, `unknown`). Runs on any runtime with a global `WebSocket`.
 *
 * @example
 * ```ts
 * import { PolymarketMarketSocket } from '@tundraconnect/polymarket/sockets';
 *
 * const socket = new PolymarketMarketSocket({ assetIds: ['<token id>'] });
 * for await (const event of socket) {
 *   switch (event.type) {
 *     case 'book':
 *     case 'price_change':
 *       console.log(event.type, event.venueTimestamp, event.receivedAt);
 *       break;
 *     case 'connected':
 *       if (event.reconnected) console.warn('stale until the next book');
 *       break;
 *   }
 * }
 * ```
 *
 * @module
 */

export {
  type FeedConnectedEvent,
  type FeedDataEvent,
  type FeedDisconnectedEvent,
  type FeedErrorEvent,
  type FeedEventBase,
  type FeedGapEvent,
  type FeedInvalidEvent,
  type FeedLifecycleEvent,
  type FeedReconnectOptions,
  FeedSocket,
  type FeedSocketErrorCode,
  type FeedSocketOptions,
  type FeedSocketState,
  type FeedUnknownEvent,
  type WebSocketFactory,
} from './FeedSocket.ts';
export {
  POLYMARKET_MARKET_WS_URL,
  type PolymarketMarketEvent,
  PolymarketMarketSocket,
  type PolymarketMarketSocketEvent,
  type PolymarketMarketSocketOptions,
} from './PolymarketMarketSocket.ts';
export {
  POLYMARKET_USER_WS_URL,
  type PolymarketUserEvent,
  PolymarketUserSocket,
  type PolymarketUserSocketEvent,
  type PolymarketUserSocketOptions,
} from './PolymarketUserSocket.ts';
export {
  POLYMARKET_PRICE_WS_URL,
  type PolymarketPriceChannel,
  type PolymarketPriceEnvelopeFields,
  type PolymarketPriceEvent,
  type PolymarketPriceFilter,
  PolymarketPriceSocket,
  type PolymarketPriceSocketEvent,
  type PolymarketPriceSocketOptions,
} from './PolymarketPriceSocket.ts';
export {
  POLYMARKET_LIVE_DATA_WS_URL,
  type PolymarketLiveDataPriceEvent,
  PolymarketLiveDataSocket,
  type PolymarketLiveDataSocketEvent,
  type PolymarketLiveDataSocketOptions,
  type PolymarketLiveDataSource,
} from './PolymarketLiveDataSocket.ts';
