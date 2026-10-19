/**
 * Polymarket error-code to message-template map.
 *
 * Covers configuration/credential errors specific to this connect's
 * signing-key custody model, the CLOB's documented order-submission
 * outcomes (no-match, version mismatch), and the generic HTTP-status
 * fallbacks every connect needs.
 */
export const PolymarketErrorCodes = {
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with Polymarket.',
  INVALID_REQUEST:
    'Polymarket rejected the request as invalid (HTTP ${status}): ${detail}',
  RESPONSE_ERROR: 'Polymarket API response did not match the expected schema.',
  RATE_LIMITED: 'Polymarket rate-limited this request (HTTP 429).',
  NOT_FOUND: 'The requested Polymarket resource was not found.',
  AUTH_FAILED:
    'Polymarket rejected the request credentials (HTTP 401): ${detail}',
  SERVICE_UNAVAILABLE:
    'Polymarket service is currently unavailable (HTTP ${status}).',

  CONFIG_MISSING_PRIVATE_KEY:
    'Polymarket CLOB trading methods require `auth.privateKey` or `auth.signer` — construct the client with `auth` set, or use only the Gamma (public market data) methods.',
  CONFIG_INVALID_PRIVATE_KEY:
    'Polymarket `auth.privateKey` is not a valid secp256k1 private key.',
  CONFIG_INVALID_SIGNER: 'Polymarket `auth.signer` is unusable: ${detail}',
  SIGNER_FAILED:
    'The injected Polymarket signer failed or returned an unusable signature: ${detail}',
  CONFIG_INVALID_FUNDER:
    'Polymarket `auth.funder` is not a valid address: ${funder}',
  NO_API_CREDENTIALS:
    'No CLOB API credentials — call deriveApiCredentials() first, or construct the client with `auth.apiCredentials` already set.',

  ORDER_REJECTED: 'Polymarket rejected the order: ${detail}',
  ORDER_VERSION_MISMATCH_PERSISTED:
    'Polymarket reported order_version_mismatch again after refreshing the protocol version and re-signing once.',

  CONFIG_MISSING_RELAYER_CREDENTIALS:
    "Polymarket Relayer methods (split/merge/redeem) require `auth.relayerApiKey` and `auth.relayerApiKeyAddress` — a separate credential from the CLOB's L2 API key, obtained independently from Polymarket.",
  TIMEOUT:
    'The Polymarket API did not answer within the ${timeoutSeconds}s timeout.',
  NETWORK_ERROR:
    'The request to Polymarket failed before a response (DNS, TLS or connection failure).',

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
    'Polymarket reported an error on the ${feed} socket: ${detail}',
  SOCKET_AUTH_FAILED:
    'Polymarket refused the ${feed} socket credentials: ${detail}',
  SOCKET_MISSING_CREDENTIALS:
    'The ${feed} socket needs CLOB API credentials — pass `auth.apiCredentials` (the same object the REST client uses).',
} as const;

/** Valid Polymarket error code. */
export type PolymarketErrorCode = keyof typeof PolymarketErrorCodes;

/**
 * The codes that mean "no answer yet — try again later", as opposed to a
 * definite refusal or a misconfiguration retrying will not fix: the
 * timeout passed, the network failed, Polymarket returned a 5xx, or it
 * rate-limited the call. {@link PolymarketError.transient} is `true` for
 * exactly these.
 */
export const POLYMARKET_TRANSIENT_CODES: ReadonlySet<PolymarketErrorCode> =
  new Set<
    PolymarketErrorCode
  >([
    'TIMEOUT',
    'NETWORK_ERROR',
    'RATE_LIMITED',
    'SERVICE_UNAVAILABLE',
  ]);
