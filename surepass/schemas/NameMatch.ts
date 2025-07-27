import { Guardian, type GuardianType } from '$guardian';

/**
 * Schema for Surepass name matching response
 *
 * Validates the response from the name matching API endpoint which compares
 * two names and returns a similarity score and match status.
 *
 * @example
 * ```typescript
 * const response = {
 *   client_id: 'client-123',
 *   name_1: 'John Doe',
 *   name_2: 'john doe',
 *   match_score: 0.95,
 *   match_status: true
 * };
 *
 * const [error, result] = SurepassNameMatchSchema.validate(response);
 * if (!error) {
 *   console.log(`Match score: ${result.match_score}`);
 * }
 * ```
 */
export const SurepassNameMatchSchema = Guardian.object().schema({
  /** Unique client identifier for the request */
  client_id: Guardian.string(),
  /** First name provided for comparison */
  name_1: Guardian.string(),
  /** Second name provided for comparison */
  name_2: Guardian.string(),
  /** Similarity score between 0 and 1 */
  match_score: Guardian.number(),
  /** Boolean indicating if names match above threshold */
  match_status: Guardian.boolean(),
});

/**
 * Type definition for Surepass name match response
 */
export type SurepassNameMatch = GuardianType<typeof SurepassNameMatchSchema>;
