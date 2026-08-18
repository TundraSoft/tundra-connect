/**
 * CoinGecko error-code to message-template map.
 *
 * Vendor-documented `error_code` values (10002, 10005, 10010, 10011) map to
 * their own codes; every other failure is dispatched primarily on HTTP
 * status. Connect-specific codes cover client configuration and response
 * validation.
 */
export const CoinGeckoErrorCodes = {
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with CoinGecko.',
  CONFIG_INVALID_ENVIRONMENT:
    "Environment must be 'demo' or 'pro', got ${environment}.",
  CONFIG_INVALID_API_KEY: 'API key must be a non-empty string.',
  CONFIG_MISSING_API_KEY: "An apiKey is required when environment is 'pro'.",
  MISSING_API_KEY:
    'CoinGecko rejected the request: no API key was supplied (vendor error_code 10002, status ${status}).',
  PLAN_RESTRICTED:
    'This endpoint is not available on your CoinGecko plan (vendor error_code 10005, status ${status}).',
  INVALID_KEY_WRONG_HOST:
    'The API key does not match the requested host — a demo key was sent to the pro host, or a pro key was sent to the demo host (vendor error_code 10010/10011, status ${status}).',
  RATE_LIMITED: 'CoinGecko rate limit exceeded (status ${status}).',
  INVALID_REQUEST:
    'CoinGecko rejected the request as invalid (status ${status}).',
  NOT_FOUND:
    'The requested CoinGecko resource was not found (status ${status}).',
  RESPONSE_ERROR: 'CoinGecko API response did not match the expected schema.',
  SERVICE_UNAVAILABLE:
    'CoinGecko service is currently unavailable (status ${status}).',
} as const;

/** Valid CoinGecko error code. */
export type CoinGeckoErrorCode = keyof typeof CoinGeckoErrorCodes;
