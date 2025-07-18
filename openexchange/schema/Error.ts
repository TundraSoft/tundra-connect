import { Guardian, type GuardianType } from '$guardian';

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
 * const [error, validatedError] = ErrorSchemaObject.validate(errorResponse);
 * if (!error) {
 *   console.log(`API Error: ${validatedError.message}`);
 * }
 * ```
 */
export const ErrorSchemaObject = Guardian.object().schema({
  /** Always true for error responses */
  error: Guardian.boolean().equals(true),
  /** HTTP status code of the error response */
  status: Guardian.number().in([400, 401, 403, 404, 429]),
  /** Error message identifier */
  message: Guardian.string().in([
    'not_found', // 404: Resource not found
    'missing_app_id', // 400: API key not provided
    'invalid_app_id', // 401: Invalid or expired API key
    'not_allowed', // 403: Operation not allowed for current plan
    'access_restricted', // 403: Access restricted (same as not_allowed)
    'invalid_base', // 400: Invalid base currency code
  ]),
  /** Human-readable description of the error */
  description: Guardian.string(),
});

/** Type definition for OpenExchange API error responses */
export type ErrorSchema = GuardianType<typeof ErrorSchemaObject>;
