import { type BaseGuardian, Guardian } from '@guardian';

/** Type definition for {@link ErrorResponseSchemaObject}. */
export type ErrorResponseSchema = {
  /** Vendor error code, e.g. `INVALID_REQUEST`. */
  code: string;
  /** Human-readable description. */
  message: string;
};

/**
 * Schema for Dodo's error envelope, `{ code, message }`.
 *
 * Used only to READ a rejection — `DodoPayments.__toError` parses a
 * failure body with this to recover the vendor's own code, falling back to
 * HTTP-status mapping when the body isn't this shape (a gateway 502
 * serving HTML, say). It never validates a success.
 *
 * @example
 * ```typescript
 * import { ErrorResponseSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, body] = ErrorResponseSchemaObject.safeParse({
 *   code: 'INVALID_REQUEST',
 *   message: 'product_cart must not be empty',
 * });
 * ```
 */
export const ErrorResponseSchemaObject: BaseGuardian<ErrorResponseSchema> =
  Guardian.object({
    code: Guardian.string(),
    message: Guardian.string(),
  }).passthrough().describe({
    title: 'Dodo error response',
    description: 'The `{ code, message }` envelope returned on a failure.',
  });
