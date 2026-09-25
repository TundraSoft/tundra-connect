/**
 * OpenExchange error-code to message-template map.
 *
 * Vendor-provided codes are preserved where Open Exchange Rates documents
 * them; connect-specific codes cover configuration and response validation.
 */
export const OpenExchangeErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred in Open Exchange.',
  MISSING_APP_ID: 'Application ID is required for the API request.',
  CONFIG_INVALID_APP_ID: 'Application ID must be a non-empty string.',
  CONFIG_INVALID_BASE_CURRENCY:
    'Base currency must be a 3-character string, got ${baseCurrency}.',
  // Connect-specific: local request validation, caught before the call is
  // ever made.
  INVALID_DATE: 'The historical date must be a YYYY-MM-DD string, got ${date}.',
  INVALID_APP_ID:
    'Invalid application ID provided (expired or de-activated application id).',
  NOT_FOUND: 'The requested resource was not found.',
  NOT_ALLOWED: 'This operation is not allowed with the current application ID.',
  RESPONSE_ERROR:
    'Open Exchange API response did not match the expected schema.',
  SERVICE_UNAVAILABLE: 'Open Exchange service is currently unavailable.',
  RATE_LIMITED:
    'OpenExchangeRates rate limit exceeded (HTTP ${status}) — retry after the hinted delay.',
} as const;

/** Valid OpenExchange error code. */
export type OpenExchangeErrorCode = keyof typeof OpenExchangeErrorCodes;
