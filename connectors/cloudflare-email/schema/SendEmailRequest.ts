import { type BaseGuardian, Guardian } from '@guardian';
import { AttachmentSchemaObject } from './Attachment.ts';

/** Cloudflare's documented ceiling on `to` + `cc` + `bcc` for one send. */
export const MAX_RECIPIENTS = 50;

/**
 * Type definition for {@link SendEmailRequestSchemaObject} — the WIRE
 * shape, i.e. what is actually serialized into the request body.
 *
 * `to`/`cc`/`bcc` are always arrays here. Callers may pass a bare string
 * for any of them (see {@link SendEmailRequestSchemaObject}'s note on the
 * vendor's own docs disagreeing with itself); the schema normalizes that
 * to a single-element array before validating, so only the array form
 * ever reaches the wire.
 */
export type SendEmailRequestSchema = {
  /** Sender address. Must be on a domain verified in the Cloudflare account. */
  from: string;
  /** Recipients. At least one; `to` + `cc` + `bcc` together cap at {@link MAX_RECIPIENTS}. */
  to: string[];
  /** Subject line. */
  subject: string;
  /** HTML body. At least one of `html`/`text` is required. */
  html?: string;
  /** Plain-text body. At least one of `html`/`text` is required. */
  text?: string;
  /** Carbon-copy recipients. */
  cc?: string[];
  /** Blind-carbon-copy recipients. */
  bcc?: string[];
  /** Address replies should go to, when it differs from `from`. */
  reply_to?: string;
  /** Custom headers, e.g. `List-Unsubscribe` or an `X-`-prefixed campaign tag. */
  headers?: Record<string, string>;
  /** Base64-encoded file attachments. */
  attachments?: import('./Attachment.ts').AttachmentSchema[];
};

/** Coerces a bare string recipient field into the single-element array the wire expects. */
function toArray(value: unknown): unknown {
  return typeof value === 'string' ? [value] : value;
}

/**
 * Normalizes a caller-supplied send request into the wire shape.
 *
 * Done as ONE top-level `Guardian.preprocess` over the whole object rather
 * than a per-field `Guardian.preprocess` on `to`/`cc`/`bcc`: a preprocess
 * guardian used AS an `Guardian.object()` field's value silently skips its
 * transform, so the raw value would hit the array check unconverted. See
 * CONVENTIONS.md and `connectors/polymarket/schema/GammaMarket.ts` for the
 * same pattern and the reasoning behind it.
 */
function normalizeSendEmailRequest(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  if (obj.to !== undefined) out.to = toArray(obj.to);
  if (obj.cc !== undefined) out.cc = toArray(obj.cc);
  if (obj.bcc !== undefined) out.bcc = toArray(obj.bcc);
  return out;
}

const _sendEmailRequest = Guardian.object({
  from: Guardian.string().email('`from` must be a valid email address'),
  to: Guardian.array(Guardian.string().email())
    .nonEmpty('At least one `to` recipient is required'),
  subject: Guardian.string().notEmpty('`subject` cannot be empty'),
  html: Guardian.string().optional(),
  text: Guardian.string().optional(),
  cc: Guardian.array(Guardian.string().email()).optional(),
  bcc: Guardian.array(Guardian.string().email()).optional(),
  reply_to: Guardian.string().email('`reply_to` must be a valid email address')
    .optional(),
  headers: Guardian.record(Guardian.string()).optional(),
  attachments: Guardian.array(AttachmentSchemaObject).optional(),
}).describe({
  title: 'Send email request',
  description:
    'Body for POST /accounts/{account_id}/email/sending/send — sender, recipients, subject, at least one body part, and optional cc/bcc/reply-to/headers/attachments.',
});

/**
 * Schema for the send-email request body.
 *
 * Accepts a bare string for `to`/`cc`/`bcc` and normalizes it to an array.
 * That leniency is deliberate: Cloudflare's own documentation disagrees
 * with itself — the Email Sending quickstart's `curl` example passes
 * `"to": "recipient@example.com"` as a plain string, while the API
 * reference specifies an array of strings. Accepting both and always
 * SENDING the array form means a caller who copied either version of the
 * vendor's docs gets the same, wire-correct result.
 *
 * Body-part and recipient-count rules are NOT enforced here — "at least
 * one of html/text" and the {@link MAX_RECIPIENTS} cap span fields, which
 * this object schema can't express; `CloudflareEmail.send` checks both
 * before the request goes out.
 *
 * @example
 * ```typescript
 * import { SendEmailRequestSchemaObject } from '@tundraconnect/cloudflare-email/schemas';
 *
 * const [error, body] = SendEmailRequestSchemaObject.safeParse({
 *   from: 'welcome@yourdomain.com',
 *   to: 'recipient@example.com', // normalized to ['recipient@example.com']
 *   subject: 'Welcome!',
 *   text: 'Thanks for signing up.',
 * });
 * ```
 */
export const SendEmailRequestSchemaObject: BaseGuardian<
  SendEmailRequestSchema
> = Guardian.preprocess(normalizeSendEmailRequest, _sendEmailRequest);
