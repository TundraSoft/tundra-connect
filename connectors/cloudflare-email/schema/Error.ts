import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link ErrorItemSchemaObject} — one entry of the
 * `errors` array Cloudflare's standard `client/v4` envelope carries.
 */
export type ErrorItemSchema = {
  /** Cloudflare's numeric error code, e.g. `10001`. */
  code: number;
  /** Machine-readable message, e.g. `email.sending.error.invalid_request_schema`. */
  message: string;
};

/**
 * Schema for one entry of an error envelope's `errors` array.
 *
 * @example
 * ```typescript
 * import { ErrorItemSchemaObject } from '@tundraconnect/cloudflare-email/schemas';
 *
 * const [error, item] = ErrorItemSchemaObject.safeParse({
 *   code: 10001,
 *   message: 'email.sending.error.invalid_request_schema',
 * });
 * ```
 */
export const ErrorItemSchemaObject: BaseGuardian<ErrorItemSchema> = Guardian
  .object({
    code: Guardian.number(),
    message: Guardian.string(),
  }).passthrough().describe({
    title: 'Cloudflare error item',
    description:
      'One entry of the `errors` array on a Cloudflare client/v4 response envelope.',
  });

/**
 * Type definition for {@link ErrorEnvelopeSchemaObject}.
 *
 * Note `result` is deliberately absent: on a failure Cloudflare sets it to
 * `null`, and nothing in the error path reads it.
 */
export type ErrorEnvelopeSchema = {
  success: boolean;
  errors: ErrorItemSchema[];
};

/**
 * Schema for the failure form of Cloudflare's `client/v4` envelope.
 *
 * Used only to READ a rejection — `CloudflareEmail.__toError` parses the
 * body with this to recover the vendor's numeric code, and falls back to
 * HTTP-status mapping when a response doesn't match (a gateway-level 502
 * returning HTML, say). It is never used to validate a success.
 *
 * @example
 * ```typescript
 * import { ErrorEnvelopeSchemaObject } from '@tundraconnect/cloudflare-email/schemas';
 *
 * const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
 *   success: false,
 *   errors: [{ code: 10101, message: 'email.sending.error.unauthorized' }],
 *   messages: [],
 *   result: null,
 * });
 * ```
 */
export const ErrorEnvelopeSchemaObject: BaseGuardian<ErrorEnvelopeSchema> =
  Guardian.object({
    success: Guardian.boolean(),
    errors: Guardian.array(ErrorItemSchemaObject),
  }).passthrough().describe({
    title: 'Cloudflare error envelope',
    description:
      'The failure form of the standard Cloudflare client/v4 response envelope.',
  });
