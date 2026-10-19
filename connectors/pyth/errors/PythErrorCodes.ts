/**
 * Pyth error-code to message-template map.
 *
 * Covers the Pyth Pro WebSocket socket (`./sockets`): connection lifecycle,
 * the venue's error replies, and configuration. REST (Hermes, Pyth Pro
 * HTTP) codes join here when those clients land.
 */
export const PythErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with Pyth.',
  INVALID_REQUEST: 'Pyth rejected the request as invalid (HTTP ${status}).',
  RESPONSE_ERROR: 'Pyth API response did not match the expected schema.',
  SERVICE_UNAVAILABLE:
    'Pyth service is currently unavailable (HTTP ${status}).',

  SOCKET_MISSING_CREDENTIALS:
    "The Pyth Pro socket needs an access token — pass `auth: { type: 'BEARER', token }` from your Pyth Pro distributor.",
  SOCKET_INVALID_SUBSCRIPTION: 'Invalid Pyth Pro subscription: ${detail}',
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
  SOCKET_VENUE_ERROR: 'Pyth reported an error on the ${feed} socket: ${detail}',
} as const;

/** Valid Pyth error code. */
export type PythErrorCode = keyof typeof PythErrorCodes;
