import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Every `error-codes` value Cloudflare documents for siteverify, plus the
 * two this connect adds when a verification passed at Cloudflare but failed
 * a caller's `expectedHostname` / `expectedAction` check.
 */
export const TURNSTILE_ERROR_CODES = [
  'missing-input-secret',
  'invalid-input-secret',
  'missing-input-response',
  'invalid-input-response',
  'bad-request',
  'timeout-or-duplicate',
  'internal-error',
  // Added by this connect, never by Cloudflare:
  'hostname-mismatch',
  'action-mismatch',
] as const;

/** One entry of a verification's `error-codes`. Undocumented values are kept as `string`. */
export type TurnstileErrorCode = typeof TURNSTILE_ERROR_CODES[number];

/**
 * Type definition for {@link VerificationSchemaObject}: a siteverify
 * response body, exactly as Cloudflare shapes it.
 */
export type VerificationSchema = {
  /** Whether the token was valid, unspent, and (if asked) matched the expected hostname and action. */
  success: boolean;
  /** Why `success` is `false`; `[]` on success. */
  'error-codes'?: string[];
  /** ISO 8601 time the challenge was solved. */
  challenge_ts?: string;
  /** The hostname the widget was served on — compare it with your site. */
  hostname?: string;
  /** The widget's `data-action`, when one was set. */
  action?: string;
  /** The widget's `data-cdata`, when one was set. */
  cdata?: string;
  /** Enterprise-only extras, e.g. `ephemeral_id`. */
  metadata?: {
    /** Ephemeral ID of the visitor's device (Enterprise Bot Management). */
    ephemeral_id?: string;
    [key: string]: unknown;
  };
};

/**
 * Schema for a siteverify response.
 *
 * Lenient on purpose: every field but `success` is optional, `error-codes`
 * is `string[]` rather than a closed enum (a new Cloudflare code must not
 * turn a verdict into a `RESPONSE_ERROR`), and unknown keys pass through.
 *
 * @example
 * ```typescript
 * import { VerificationSchemaObject } from '@tundraconnect/cloudflare-turnstile/schemas';
 *
 * const [error, verdict] = VerificationSchemaObject.safeParse({
 *   success: true,
 *   'error-codes': [],
 *   challenge_ts: '2026-10-04T12:00:00.000Z',
 *   hostname: 'example.com',
 *   action: 'login',
 * });
 * ```
 */
export const VerificationSchemaObject: BaseGuardian<VerificationSchema> =
  Guardian.object({
    success: Guardian.boolean().strict(),
    'error-codes': Guardian.array(Guardian.string()).optional(),
    challenge_ts: Guardian.string().optional(),
    hostname: Guardian.string().optional(),
    action: Guardian.string().optional(),
    cdata: Guardian.string().optional(),
    metadata: Guardian.object({
      ephemeral_id: Guardian.string().optional(),
    }).passthrough().optional(),
  }).passthrough().describe({
    title: 'Turnstile verification',
    description:
      'The siteverify verdict: `success`, the `error-codes` behind a failure, and the challenge timestamp, hostname, action and cdata.',
  });
