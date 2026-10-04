/**
 * Kalshi error-code to message-template map.
 *
 * Covers configuration/credential errors specific to this connect's
 * RSA-PSS signing-key custody model, the pre-flight order-validation rail
 * (mirrors of the price/count sanity checks the Rust reference proved out
 * against UAT), and the generic HTTP-status fallbacks every connect needs.
 */
export const KalshiErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with Kalshi.',
  INVALID_REQUEST:
    'Kalshi rejected the request as invalid (HTTP ${status}): ${detail}',
  RESPONSE_ERROR: 'Kalshi API response did not match the expected schema.',
  AUTH_FAILED: 'Kalshi rejected the request credentials (HTTP 401): ${detail}',
  NOT_FOUND: 'The requested Kalshi resource was not found.',
  RATE_LIMITED: 'Kalshi rate-limited this request (HTTP 429).',
  SERVICE_UNAVAILABLE:
    'Kalshi service is currently unavailable (HTTP ${status}).',

  CONFIG_MISSING_PRIVATE_KEY:
    'Kalshi portfolio/order methods require `auth.privateKeyPem` and `auth.accessKey` — construct the client with `auth` set, or use only the public market-data methods.',
  CONFIG_INVALID_BATCH_SIZE:
    'cancelAllOrders batchSize must be a positive integer, got ${value}.',
  CONFIG_INVALID_PRIVATE_KEY:
    'Kalshi `auth.privateKeyPem` is not a valid PKCS#8 RSA private key.',

  ORDER_REJECTED: 'Kalshi rejected the order: ${detail}',
  TIMEOUT:
    'The Kalshi API did not answer within the ${timeoutSeconds}s timeout.',
  NETWORK_ERROR:
    'The request to Kalshi failed before a response (DNS, TLS or connection failure).',
} as const;

/** Valid Kalshi error code. */
export type KalshiErrorCode = keyof typeof KalshiErrorCodes;

/**
 * The codes that mean "no answer yet — try again later", as opposed to a
 * definite refusal or a misconfiguration retrying will not fix: the
 * timeout passed, the network failed, Kalshi returned a 5xx, or it
 * rate-limited the call. {@link KalshiError.transient} is `true` for
 * exactly these.
 */
export const KALSHI_TRANSIENT_CODES: ReadonlySet<KalshiErrorCode> = new Set<
  KalshiErrorCode
>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
]);
