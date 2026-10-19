/**
 * Binance.com spot market-data streams: {@link BinanceMarketSocket} streams
 * every raw trade, best bid/ask change and 100ms depth diff for the symbols
 * you choose — public, no credentials, validated with Guardian, delivered as
 * one async iterable with explicit `connected` / `disconnected` / `gap`
 * events. Runs on any runtime with a global `WebSocket`.
 *
 * @example
 * ```ts
 * import { BinanceMarketSocket } from '@tundraconnect/binance/sockets';
 *
 * const socket = new BinanceMarketSocket({
 *   streams: { trade: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'] },
 * });
 * for await (const event of socket) {
 *   if (event.type === 'trade') console.log(event.data.symbol, event.data.price);
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
  BINANCE_DATA_STREAM_URL,
  BINANCE_STREAM_URL,
  type BinanceMarketEvent,
  BinanceMarketSocket,
  type BinanceMarketSocketEvent,
  type BinanceMarketSocketOptions,
  type BinanceStreamField,
  type BinanceStreamKind,
} from './BinanceMarketSocket.ts';
