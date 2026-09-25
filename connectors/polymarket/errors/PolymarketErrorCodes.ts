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
    'Polymarket CLOB trading methods require `auth.privateKey` — construct the client with `auth` set, or use only the Gamma (public market data) methods.',
  CONFIG_INVALID_PRIVATE_KEY:
    'Polymarket `auth.privateKey` is not a valid secp256k1 private key.',
  CONFIG_INVALID_FUNDER:
    'Polymarket `auth.funder` is not a valid address: ${funder}',
  NO_API_CREDENTIALS:
    'No CLOB API credentials — call deriveApiCredentials() first, or construct the client with `auth.apiCredentials` already set.',

  ORDER_REJECTED: 'Polymarket rejected the order: ${detail}',
  ORDER_VERSION_MISMATCH_PERSISTED:
    'Polymarket reported order_version_mismatch again after refreshing the protocol version and re-signing once.',

  CONFIG_MISSING_RELAYER_CREDENTIALS:
    "Polymarket Relayer methods (split/merge/redeem) require `auth.relayerApiKey` and `auth.relayerApiKeyAddress` — a separate credential from the CLOB's L2 API key, obtained independently from Polymarket.",
} as const;

/** Valid Polymarket error code. */
export type PolymarketErrorCode = keyof typeof PolymarketErrorCodes;
