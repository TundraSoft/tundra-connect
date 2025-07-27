import { Guardian, type GuardianType } from '$guardian';

/**
 * Schema for Surepass API response structure
 *
 * Validates the common response format used by all Surepass API endpoints.
 * All fields are optional as different endpoints may return different
 * combinations of these fields.
 *
 * @example
 * ```typescript
 * const response = {
 *   status_code: 200,
 *   success: true,
 *   message: 'Verification successful',
 *   message_code: 'SUCCESS',
 *   data: {}
 * };
 *
 * const [error, result] = SurepassResponseSchema.validate(response);
 * if (!error) {
 *   console.log('API call successful:', result.success);
 * }
 * ```
 */
export const SurepassResponseSchema = Guardian.object().schema({
  /** HTTP status code of the response */
  status_code: Guardian.number().integer().optional(),
  /** Boolean indicating if the request was successful */
  success: Guardian.boolean().optional(),
  /** Human-readable message describing the response */
  message: Guardian.string().optional(),
  /** Machine-readable message code (uppercase) */
  message_code: Guardian.string().upperCase().optional(),
  /** Response data specific to the endpoint */
  data: Guardian.object().optional(),
});

/**
 * Type definition for Surepass API response
 */
export type SurepassResponse = GuardianType<typeof SurepassResponseSchema>;
