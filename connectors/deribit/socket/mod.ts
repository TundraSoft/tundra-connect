/**
 * Deribit market-data feed: {@link DeribitSocket} streams order books
 * (snapshot plus every change, with `change_id` gap detection), trades,
 * tickers with mark IV and greeks, DVOL, price indices and option mark
 * prices over Deribit's JSON-RPC WebSocket — validated with Guardian,
 * delivered as one async iterable with explicit `connected` /
 * `disconnected` / `gap` events. Runs on any runtime with a global
 * `WebSocket`.
 *
 * @example
 * ```ts
 * import { DeribitSocket } from '@tundraconnect/deribit/sockets';
 *
 * const socket = new DeribitSocket({
 *   subscriptions: [{ kind: 'markPrice', index: 'btc_usd' }],
 * });
 * for await (const event of socket) {
 *   if (event.type === 'markPrice') console.log(event.data.instrumentName, event.data.iv);
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
  DERIBIT_WS_URLS,
  type DeribitAuth,
  deribitChannel,
  type DeribitChannelField,
  type DeribitInterval,
  DeribitSocket,
  type DeribitSocketDataEvent,
  type DeribitSocketEvent,
  type DeribitSocketOptions,
  type DeribitSubscription,
  type DeribitTradesKind,
} from './DeribitSocket.ts';
