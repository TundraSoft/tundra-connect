import { BaseError } from '$utils';

/**
 * Error codes and messages for OpenExchange API errors
 *
 * This object contains all possible error codes that can be thrown by the
 * OpenExchange client, along with their corresponding error messages.
 * Messages support template variables using ${variable} syntax.
 */
export const OpenExchangeErrorCodes = {
  /** Generic error when no specific error code matches */
  UNKNOWN_ERROR: 'An unknown error occurred in Open Exchange.',
  /** Error when API key is missing from request */
  MISSING_APP_ID: 'Application ID is required for the API request.',
  /** Error when provided API key is invalid format */
  CONFIG_INVALID_APP_ID: 'Application ID must be a non-empty string.',
  /** Error when base currency configuration is invalid */
  CONFIG_INVALID_BASE_CURRENCY:
    'Base currency must be a 3-character string, got ${baseCurrency}.',
  /** Error when API key is invalid or expired */
  INVALID_APP_ID:
    'Invalid application ID provided (expired or de-activated application id).',
  /** Error when the requested resource was not found */
  NOT_FOUND: 'The requested resource was not found.',
  /** Error when the operation is not allowed with the current API key */
  NOT_ALLOWED: 'This operation is not allowed with the current application ID.',
  /** Error when API returns unexpected response */
  RESPONSE_ERROR:
    'Got an invalid response/response status: ${status} from Open Exchange API.',
  SERVICE_UNAVAILABLE: 'Open Exchange service is currently unavailable.',
};

/**
 * Valid error codes for OpenExchange errors
 */
type OpenExchangeErrorCode = keyof typeof OpenExchangeErrorCodes;

/**
 * Custom error class for OpenExchange API errors
 *
 * Extends BaseError to provide OpenExchange-specific error handling with
 * structured error codes, metadata, and consistent error formatting.
 *
 * @template M - Metadata type extending base metadata with optional originalCode
 *
 * @example
 * ```typescript
 * // Throw an error with metadata
 * throw new OpenExchangeError('INVALID_APP_ID', {
 *   appId: 'invalid-key',
 *   type: 'authentication'
 * });
 *
 * // Throw an error with cause
 * try {
 *   // some operation
 * } catch (cause) {
 *   throw new OpenExchangeError('RESPONSE_ERROR', {
 *     status: 500
 *   }, cause);
 * }
 * ```
 */
export class OpenExchangeError<
  M extends { originalCode?: OpenExchangeErrorCode } & Record<string, unknown> =
    & { originalCode?: OpenExchangeErrorCode }
    & Record<string, unknown>,
> extends BaseError<M> {
  /**
   * Template for error message formatting
   * @returns The message template with timestamp and message placeholders
   * @protected
   */
  protected override get _messageTemplate(): string {
    return '[OpenExchange] ${timeStamp}: ${message}';
  }

  /**
   * Creates a new OpenExchangeError instance
   *
   * @param code - The error code from OpenExchangeErrorCodes
   * @param meta - Optional metadata object with additional error context
   * @param cause - Optional underlying error that caused this error
   *
   * @example
   * ```typescript
   * // Basic error
   * new OpenExchangeError('INVALID_APP_ID');
   *
   * // Error with metadata
   * new OpenExchangeError('NOT_FOUND', {
   *   resourceId: 'some-resource',
   *   type: 'endpoint'
   * });
   *
   * // Error with cause
   * new OpenExchangeError('RESPONSE_ERROR', {
   *   status: 500
   * }, networkError);
   * ```
   */
  constructor(code: OpenExchangeErrorCode, meta?: M, cause?: Error) {
    // Handle unknown error codes by preserving original and falling back to UNKNOWN_ERROR
    if (!OpenExchangeErrorCodes[code]) {
      if (!meta) {
        meta = {} as M;
      }
      meta.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }
    super(OpenExchangeErrorCodes[code], meta, cause);
  }
}
