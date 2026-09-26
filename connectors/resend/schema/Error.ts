import { type BaseGuardian, Guardian } from '@guardian';

/** Type definition for {@link ErrorResponseSchemaObject}. */
export type ErrorResponseSchema = {
  /** Resend's machine-readable error type, e.g. `validation_error`. */
  name: string;
  /** Human-readable explanation. */
  message: string;
  /** HTTP status Resend echoes into the body. */
  statusCode?: number;
};

/**
 * Schema for Resend's error body, `{ statusCode, name, message }`.
 *
 * Used only to READ a rejection — `Resend.__toError` parses the body with
 * this to recover the vendor's `name`, and falls back to HTTP-status
 * mapping when a response doesn't match (a gateway error serving HTML,
 * say). It is never used to validate a success.
 *
 * @example
 * ```typescript
 * import { ErrorResponseSchemaObject } from '@tundraconnect/resend/schemas';
 *
 * const [error, body] = ErrorResponseSchemaObject.safeParse({
 *   statusCode: 422,
 *   name: 'missing_required_field',
 *   message: 'Missing `to` field.',
 * });
 * ```
 */
export const ErrorResponseSchemaObject: BaseGuardian<ErrorResponseSchema> =
  Guardian.object({
    name: Guardian.string(),
    message: Guardian.string(),
    statusCode: Guardian.number().optional(),
  }).passthrough().describe({
    title: 'Resend error response',
    description:
      'The body Resend returns with a 4xx/5xx: its error type name, a message, and the echoed status code.',
  });
