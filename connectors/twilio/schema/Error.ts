import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Schema for Twilio API error responses
 *
 * Validates the JSON error envelope Twilio returns on non-2xx responses.
 * Not every field is guaranteed present — `code` and `more_info` are
 * commonly, but not always, included.
 *
 * @example
 * ```typescript
 * import { ErrorSchemaObject } from '@tundraconnect/twilio/schemas';
 *
 * const errorResponse = {
 *   code: 21211,
 *   message: "The 'To' number is not a valid phone number.",
 *   more_info: 'https://www.twilio.com/docs/errors/21211',
 *   status: 400,
 * };
 *
 * const [error, validated] = ErrorSchemaObject.safeParse(errorResponse);
 * if (!error) {
 *   console.log(`Twilio error ${validated.code}: ${validated.message}`);
 * }
 * ```
 */
export type ErrorSchema = {
  code?: number;
  message: string;
  more_info?: string;
  status: number;
};

const _errorSchema: BaseGuardian<ErrorSchema> = Guardian.object({
  /** Twilio-documented error code (e.g. `21211`), when available. */
  code: Guardian.number().optional(),
  /** Human-readable error description. */
  message: Guardian.string(),
  /** URL to the Twilio error-code reference page, when available. */
  more_info: Guardian.string().optional(),
  /** HTTP status code of the response. */
  status: Guardian.number(),
}).describe({
  title: 'Twilio error response',
  description:
    'Documented error envelope returned by Twilio endpoints on non-2xx responses.',
});

/** Guardian schema that validates a {@link ErrorSchema}. */
export const ErrorSchemaObject: BaseGuardian<ErrorSchema> = _errorSchema;
