/**
 * Binance error-code to message-template map.
 *
 * Covers the market-data sockets (`./sockets`) — connection lifecycle,
 * venue error replies, geo-blocking — plus the generic fallbacks every
 * connect carries. REST codes join here when the REST client lands.
 */
export const BinanceErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with Binance.',
  INVALID_REQUEST: 'Binance rejected the request as invalid (HTTP ${status}).',
  RESPONSE_ERROR: 'Binance API response did not match the expected schema.',
  SERVICE_UNAVAILABLE:
    'Binance service is currently unavailable (HTTP ${status}).',

  SOCKET_UNSUPPORTED_RUNTIME:
    'The ${feed} socket could not create a WebSocket: ${detail}. Pass a `webSocket` factory on runtimes without a usable global WebSocket.',
  SOCKET_RECONNECT_EXHAUSTED:
    'The ${feed} socket gave up after ${attempts} reconnect attempts (last: ${reason}).',
  SOCKET_BUFFER_OVERFLOW:
    'The ${feed} socket buffered more than ${maxBufferedEvents} unread events and closed rather than drop any.',
  SOCKET_IN_USE:
    'The ${feed} socket already has an active iterator; only one consumer may read it.',
  SOCKET_CLOSED: 'The ${feed} socket is closed.',
  SOCKET_HANDLER_ERROR: 'The ${feed} socket failed while ${during}: ${detail}',
  SOCKET_INVALID_MESSAGE:
    'A ${feed} `${venueType}` message did not match the expected schema.',
  SOCKET_VENUE_ERROR:
    'Binance reported an error on the ${feed} socket: ${detail}',
  SOCKET_GEO_BLOCKED:
    'Binance refused the connection from this location (HTTP ${status} from ${url}). This is not retried: Binance.com blocks some regions outright.',
} as const;

/** Valid Binance error code. */
export type BinanceErrorCode = keyof typeof BinanceErrorCodes;
