import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link SendEmailResultSchemaObject}.
 *
 * This is the UNWRAPPED `result` object, not the full Cloudflare
 * `{success, errors, messages, result}` envelope — `CloudflareEmail`'s
 * `_responseHandler` strips that envelope before validation, so every
 * method resolves to the payload a caller actually wants (see
 * CONVENTIONS.md's "HTTP client" section on unwrapping vendor envelopes).
 */
export type SendEmailResultSchema = {
  /** Recipients the message was handed to the destination MTA for. */
  delivered?: string[];
  /** Recipients accepted and queued for later delivery. */
  queued?: string[];
  /** Recipients that hard-bounced — a permanent failure, do not retry. */
  permanent_bounces?: string[];
  /** Recipients skipped because they are on the account's suppression list. */
  suppressed_recipients?: string[];
  /** Per-message identifier, when the API returns one. */
  message_id?: string;
};

/**
 * Schema for a successful send's `result` payload.
 *
 * Every field is optional and unknown keys pass through. Email Sending is
 * a beta API whose `result` shape has already grown a field between the
 * REST guide and the API reference (`suppressed_recipients`), so pinning
 * an exact closed shape would turn any additive vendor change into a
 * `RESPONSE_ERROR` on a send that actually succeeded — the wrong trade for
 * a call that has already had a real-world side effect by the time the
 * body is parsed.
 *
 * @example
 * ```typescript
 * import { SendEmailResultSchemaObject } from '@tundraconnect/cloudflare-email/schemas';
 *
 * const [error, result] = SendEmailResultSchemaObject.safeParse({
 *   delivered: ['recipient@example.com'],
 *   queued: [],
 *   permanent_bounces: [],
 * });
 * ```
 */
export const SendEmailResultSchemaObject: BaseGuardian<SendEmailResultSchema> =
  Guardian.object({
    delivered: Guardian.array(Guardian.string()).optional(),
    queued: Guardian.array(Guardian.string()).optional(),
    permanent_bounces: Guardian.array(Guardian.string()).optional(),
    suppressed_recipients: Guardian.array(Guardian.string()).optional(),
    message_id: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'Send email result',
    description:
      'The unwrapped `result` of a successful send: per-recipient delivery disposition plus an optional message id. Additive vendor fields pass through.',
  });
