import { type BaseGuardian, Guardian } from '@guardian';

/** Turnstile's documented ceiling on a widget token's length. */
export const MAX_TOKEN_LENGTH = 2048;

/**
 * Type definition for {@link VerifyRequestSchemaObject}.
 *
 * Field names are Cloudflare's own (`response`, `remoteip`,
 * `idempotency_key`) so a body copied from the siteverify docs works
 * unchanged. The `secret` is deliberately absent: the client adds it from
 * `auth` when it builds the request, so a caller never handles it per call.
 */
export type VerifyRequestSchema = {
  /** The token the widget put in `cf-turnstile-response`. At most 2048 characters. */
  response: string;
  /** The visitor's IP address, when you have it. */
  remoteip?: string;
  /**
   * A UUID that lets the same token be verified more than once, for safe
   * retries. Without it, a second verification of the same token answers
   * `timeout-or-duplicate`.
   */
  idempotency_key?: string;
};

/**
 * Schema for the caller-supplied part of a siteverify request.
 *
 * @example
 * ```typescript
 * import { VerifyRequestSchemaObject } from '@tundraconnect/cloudflare-turnstile/schemas';
 *
 * const [error, request] = VerifyRequestSchemaObject.safeParse({
 *   response: 'XXXX.DUMMY.TOKEN.XXXX',
 *   remoteip: '203.0.113.7',
 * });
 * ```
 */
export const VerifyRequestSchemaObject: BaseGuardian<VerifyRequestSchema> =
  Guardian.object({
    response: Guardian.string().notEmpty('`response` cannot be empty')
      .maxLength(
        MAX_TOKEN_LENGTH,
        `\`response\` cannot exceed ${MAX_TOKEN_LENGTH} characters`,
      ),
    remoteip: Guardian.string().notEmpty('`remoteip` cannot be empty')
      .optional(),
    idempotency_key: Guardian.string().notEmpty(
      '`idempotency_key` cannot be empty',
    ).optional(),
  }).describe({
    title: 'Turnstile siteverify request',
    description:
      'The widget token to verify, plus the optional visitor IP and idempotency key. The secret key is added by the client.',
  });
