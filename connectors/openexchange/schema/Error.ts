import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Schema for OpenExchange API error responses
 *
 * This schema validates error responses returned by the OpenExchange API.
 * Error responses are returned when there are issues with the request such as
 * invalid API keys, missing parameters, or exceeded rate limits.
 *
 * @example
 * ```typescript
 * const errorResponse = {
 *   error: true,
 *   status: 401,
 *   message: "invalid_app_id",
 *   description: "Invalid application ID; please check your app_id"
 * };
 *
 * const [error, validatedError] = ErrorSchemaObject.safeParse(errorResponse);
 * if (!error) {
 *   console.log(`API Error: ${validatedError.message}`);
 * }
 * ```
 */
export type ErrorSchema = {
  /** Always true for error responses */
  error: boolean;
  /** HTTP status code of the error response */
  status: number;
  /** Error message identifier */
  message: string;
  /** Human-readable description of the error */
  description: string;
};

/** Schema for OpenExchange API error responses (see {@link ErrorSchema}). */
export const ErrorSchemaObject: BaseGuardian<ErrorSchema> = Guardian.object({
  /** Always true for error responses */
  error: Guardian.boolean().equals(true),
  /** HTTP status code of the error response */
  status: Guardian.number().isIn([400, 401, 403, 404, 429]),
  /** Error message identifier */
  message: Guardian.string().isIn([
    'not_found', // 404: Resource not found
    'missing_app_id', // 400: API key not provided
    'invalid_app_id', // 401: Invalid or expired API key
    'not_allowed', // 403: Operation not allowed for current plan
    'access_restricted', // 403: Access restricted (same as not_allowed)
    'invalid_base', // 400: Invalid base currency code
    'invalid_amount', // 400: Invalid amount for a /convert request
    'invalid_currency', // 400: Invalid currency code (from/to/symbols)
    'invalid_date_range', // 400: Invalid start/end date range (time-series)
    'invalid_period_for_start_time', // 400: Invalid period for the given start_time (ohlc)
    'invalid_start_time', // 400: Invalid start_time value (ohlc)
    'not_available', // 400: Requested data is not available
  ]),
  /** Human-readable description of the error */
  description: Guardian.string(),
}).describe({
  title: 'OpenExchange error response',
  description: 'Documented error envelope returned by OpenExchange endpoints.',
});
