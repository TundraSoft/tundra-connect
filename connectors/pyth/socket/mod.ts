/**
 * Pyth Pro (formerly Pyth Lazer) real-time prices, importable on its own:
 * {@link PythProSocket} connects to every redundant Pyth Pro endpoint at
 * once and merges them into one stream of Guardian-validated price
 * updates, with per-endpoint health and an overall up/degraded/down state.
 *
 * @example
 * ```ts
 * import { PythProSocket } from '@tundraconnect/pyth/sockets';
 *
 * const socket = new PythProSocket({
 *   auth: { type: 'BEARER', token: '<access token>' },
 *   subscriptions: [{ priceFeedIds: [1, 2] }],
 * });
 * for await (const event of socket) {
 *   if (event.type === 'price') console.log(event.data.priceFeedId, event.data.price);
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
  type FeedSocketErrorCode,
  type FeedSocketState,
  type FeedUnknownEvent,
  type WebSocketFactory,
} from './FeedSocket.ts';
export { PYTH_AUTH_SUBPROTOCOL } from './PythEndpointSocket.ts';
export {
  PYTH_PRO_ENDPOINTS,
  PYTH_PRO_PROPERTIES,
  type PythEndpointField,
  type PythProChannel,
  type PythProEndpointLifecycleEvent,
  type PythProFormat,
  type PythProGapEvent,
  type PythProHealth,
  type PythProHealthEvent,
  type PythProPriceEvent,
  type PythProProperty,
  type PythProSignedUpdateEvent,
  PythProSocket,
  type PythProSocketEvent,
  type PythProSocketOptions,
  type PythProSubscribedEvent,
  type PythProSubscription,
  type PythProUnsubscribedEvent,
} from './PythProSocket.ts';
