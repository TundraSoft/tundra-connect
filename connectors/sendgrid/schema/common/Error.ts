import { type BaseGuardian, Guardian } from '@guardian';

/** Type definition for a single SendGrid error entry. */
export interface ErrorItemSchema {
  /** Human-readable description of the failure. */
  message: string;
  /** Dot-path of the offending request field, or `null` when not field-specific. */
  field: string | null;
  /** Optional vendor-specific troubleshooting payload. */
  help?: unknown;
}

/**
 * Schema for a single SendGrid error entry
 *
 * SendGrid does not publish discrete machine-readable error codes — every
 * 4xx/5xx response body is a list of these free-text entries.
 */
export const ErrorItemSchemaObject: BaseGuardian<ErrorItemSchema> = Guardian
  .object({
    /** Human-readable description of the failure. */
    message: Guardian.string(),
    /** Dot-path of the offending request field, or `null` when not field-specific. */
    field: Guardian.string().nullable(),
    /** Optional vendor-specific troubleshooting payload. */
    help: Guardian.unknown().optional(),
  }).describe({
    title: 'SendGrid error item',
    description:
      'A single validation or processing failure reported by SendGrid.',
  });

/** Type definition for the SendGrid API error envelope. */
export interface ErrorSchema {
  /** One or more validation/processing failures. */
  errors: ErrorItemSchema[];
  /** Request id SendGrid assigned, when present. */
  id?: string;
}

/**
 * Schema for the SendGrid API error envelope
 *
 * Validates the `{ errors: [...], id? }` body SendGrid returns on 4xx/5xx
 * responses. There is no vendor-documented error-code registry — only
 * free-text `message` / `field` pairs — so {@link SendGridError} defines
 * its own connect-specific codes keyed off the HTTP status instead (see
 * `../errors/SendGridErrorCodes.ts`), storing this envelope's `errors`
 * array as diagnostic metadata.
 *
 * @example
 * ```typescript
 * import { ErrorSchemaObject } from '@tundraconnect/sendgrid/schemas';
 *
 * const [error, envelope] = ErrorSchemaObject.safeParse({
 *   errors: [
 *     { message: 'The from email does not contain a valid address.', field: 'from.email' },
 *   ],
 * });
 * if (!error) {
 *   console.log(envelope.errors[0].message);
 * }
 * ```
 */
export const ErrorSchemaObject: BaseGuardian<ErrorSchema> = Guardian.object({
  /** One or more validation/processing failures. */
  errors: Guardian.array(ErrorItemSchemaObject),
  /** Request id SendGrid assigned, when present. */
  id: Guardian.string().optional(),
}).describe({
  title: 'SendGrid error response',
  description:
    'Documented error envelope returned on 4xx/5xx SendGrid responses.',
});
