/**
 * Kalshi's real-time WebSocket feed, importable without the REST client:
 * {@link KalshiSocket} streams order-book snapshots and every delta, public
 * trades and tickers, and the account's fills, order updates and
 * positions. Signed with the same credentials as the REST client (or an
 * injected signer), validated with Guardian, and delivered as one async
 * iterable with explicit `connected` / `disconnected` / `gap` events.
 *
 * @example
 * ```ts
 * import { KalshiSocket } from '@tundraconnect/kalshi/sockets';
 *
 * const socket = new KalshiSocket({
 *   auth: { accessKey: '<key id>', privateKeyPem: '<PKCS#8 PEM>' },
 *   subscriptions: [{ channel: 'trade' }],
 * });
 * for await (const event of socket) {
 *   if (event.type === 'trade') console.log(event.data.marketTicker, event.data.yesPrice);
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
  KALSHI_DEMO_WS_URL,
  KALSHI_WS_URL,
  type KalshiChannel,
  type KalshiEnvelopeFields,
  KalshiSocket,
  type KalshiSocketAuth,
  type KalshiSocketDataEvent,
  type KalshiSocketEvent,
  type KalshiSocketOptions,
  type KalshiSocketSigner,
} from './KalshiSocket.ts';
