import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link ErrorItemSchemaObject} — one entry of the
 * `errors` array Cloudflare's standard `client/v4` envelope carries.
 */
export type ErrorItemSchema = {
  /** Cloudflare's numeric error code, e.g. `1406`. */
  code: number;
  /** Human-readable message, e.g. `Duplicate custom hostname found.` */
  message: string;
  /** Nested causes, e.g. `6111 Invalid format for Authorization header` under `6003`. */
  error_chain?: { code: number; message: string }[];
};

/**
 * Schema for one entry of an error envelope's `errors` array.
 *
 * @example
 * ```typescript
 * import { ErrorItemSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, item] = ErrorItemSchemaObject.safeParse({
 *   code: 1436,
 *   message: 'The custom hostname was not found.',
 * });
 * ```
 */
export const ErrorItemSchemaObject: BaseGuardian<ErrorItemSchema> = Guardian
  .object({
    code: Guardian.number().strict(),
    message: Guardian.string(),
    error_chain: Guardian.array(
      Guardian.object({
        code: Guardian.number().strict(),
        message: Guardian.string(),
      }).passthrough(),
    ).optional(),
  }).passthrough().describe({
    title: 'Cloudflare error item',
    description:
      'One entry of the `errors` array on a Cloudflare client/v4 response envelope.',
  });

/**
 * Type definition for {@link ErrorEnvelopeSchemaObject}.
 *
 * `result` is deliberately absent: on a failure Cloudflare sets it to
 * `null`, and nothing in the error path reads it.
 */
export type ErrorEnvelopeSchema = {
  success: boolean;
  errors: ErrorItemSchema[];
};

/**
 * Schema for the failure form of Cloudflare's `client/v4` envelope.
 *
 * Used only to READ a rejection — the client parses a failed body with
 * this to recover the vendor's numeric code, and falls back to HTTP-status
 * mapping when a response doesn't match (a gateway-level 502 returning
 * HTML, say). It is never used to validate a success.
 *
 * @example
 * ```typescript
 * import { ErrorEnvelopeSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
 *   success: false,
 *   errors: [{ code: 1406, message: 'Duplicate custom hostname found.' }],
 *   messages: [],
 *   result: null,
 * });
 * ```
 */
export const ErrorEnvelopeSchemaObject: BaseGuardian<ErrorEnvelopeSchema> =
  Guardian.object({
    success: Guardian.boolean().strict(),
    errors: Guardian.array(ErrorItemSchemaObject),
  }).passthrough().describe({
    title: 'Cloudflare error envelope',
    description:
      'The failure form of the standard Cloudflare client/v4 response envelope.',
  });
