import { type BaseGuardian, Guardian } from '@guardian';
import { AttachmentSchemaObject } from './Attachment.ts';
import {
  type EmailAddressSchema,
  EmailAddressSchemaObject,
} from './EmailAddress.ts';

/** Cloudflare's documented ceiling on `to` + `cc` + `bcc` for one send. */
export const MAX_RECIPIENTS = 50;

/**
 * Type definition for {@link SendEmailRequestSchemaObject} — the WIRE
 * shape, i.e. what is actually serialized into the request body.
 *
 * Every address field takes a plain address string or a named
 * `{ address, name? }` object ({@link EmailAddressSchema}), and
 * `to`/`cc`/`bcc` arrays may mix the two — all as Cloudflare's REST API
 * documents. `to`/`cc`/`bcc` are always arrays here: callers may pass a
 * single address for any of them (see {@link SendEmailRequestSchemaObject}'s
 * note on the vendor's own docs disagreeing with itself), and the schema
 * normalizes that to a single-element array before validating, so only
 * the array form ever reaches the wire.
 */
export type SendEmailRequestSchema = {
  /** Sender. Must be on a domain verified in the Cloudflare account. */
  from: EmailAddressSchema;
  /** Recipients. At least one; `to` + `cc` + `bcc` together cap at {@link MAX_RECIPIENTS}. */
  to: EmailAddressSchema[];
  /** Subject line. */
  subject: string;
  /** HTML body. At least one of `html`/`text` is required. */
  html?: string;
  /** Plain-text body. At least one of `html`/`text` is required. */
  text?: string;
  /** Carbon-copy recipients. */
  cc?: EmailAddressSchema[];
  /** Blind-carbon-copy recipients. */
  bcc?: EmailAddressSchema[];
  /** Address replies should go to, when it differs from `from`. */
  reply_to?: EmailAddressSchema;
  /** Custom headers, e.g. `List-Unsubscribe` or an `X-`-prefixed campaign tag. */
  headers?: Record<string, string>;
  /** Base64-encoded file attachments. */
  attachments?: import('./Attachment.ts').AttachmentSchema[];
};

/**
 * Parses a `"Name <address>"` string into `{ address, name }`, the shape
 * Cloudflare's REST API takes for a display name. Anything else — a plain
 * address, an object, a non-string — passes through untouched for the
 * schema to judge.
 *
 * A double-quoted name (`"Doe, Jane" <jane@example.com>`) is unquoted, and
 * a bare `<address>` with no name collapses to the plain address string.
 * Split on the LAST `<` with string methods rather than a regex: display
 * names often come from end users, and a backtracking pattern over
 * whitespace-padded input is a needless risk.
 */
function fromDisplayString(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.endsWith('>')) return value;
  const open = trimmed.lastIndexOf('<');
  if (open === -1) return value;
  const address = trimmed.slice(open + 1, -1).trim();
  let name = trimmed.slice(0, open).trim();
  if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
    name = name.slice(1, -1).replace(/\\(.)/g, '$1').trim();
  }
  return name === '' ? address : { address, name };
}

/** Normalizes a recipient field: a single address becomes a one-element array. */
function toRecipientList(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map(fromDisplayString)
    : [fromDisplayString(value)];
}

/**
 * Normalizes a caller-supplied send request into the wire shape.
 *
 * Done as ONE top-level `Guardian.preprocess` over the whole object rather
 * than a per-field `Guardian.preprocess` on each address field: a
 * preprocess guardian used AS an `Guardian.object()` field's value
 * silently skips its transform, so the raw value would hit the field's
 * check unconverted. See CONVENTIONS.md and
 * `connectors/polymarket/schema/GammaMarket.ts` for the same pattern and
 * the reasoning behind it.
 */
function normalizeSendEmailRequest(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  if (obj.from !== undefined) out.from = fromDisplayString(obj.from);
  if (obj.reply_to !== undefined) {
    out.reply_to = fromDisplayString(obj.reply_to);
  }
  if (obj.to !== undefined) out.to = toRecipientList(obj.to);
  if (obj.cc !== undefined) out.cc = toRecipientList(obj.cc);
  if (obj.bcc !== undefined) out.bcc = toRecipientList(obj.bcc);
  return out;
}

const _sendEmailRequest = Guardian.object({
  from: EmailAddressSchemaObject,
  to: Guardian.array(EmailAddressSchemaObject)
    .nonEmpty('At least one `to` recipient is required'),
  subject: Guardian.string().notEmpty('`subject` cannot be empty'),
  html: Guardian.string().optional(),
  text: Guardian.string().optional(),
  cc: Guardian.array(EmailAddressSchemaObject).optional(),
  bcc: Guardian.array(EmailAddressSchemaObject).optional(),
  reply_to: EmailAddressSchemaObject.optional(),
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
 * Every address field (`from`, `to`, `cc`, `bcc`, `reply_to`) accepts a
 * plain address, a `{ address, name? }` object, or a `"Name <address>"`
 * string; the last is parsed into the object form, since that is what the
 * REST API documents for a display name. `to`/`cc`/`bcc` also accept a
 * single address and normalize it to an array. That array leniency is deliberate: Cloudflare's own documentation disagrees
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
 *   from: 'Welcome Team <welcome@yourdomain.com>', // → { address, name }
 *   to: 'recipient@example.com', // normalized to ['recipient@example.com']
 *   subject: 'Welcome!',
 *   text: 'Thanks for signing up.',
 * });
 * ```
 */
export const SendEmailRequestSchemaObject: BaseGuardian<
  SendEmailRequestSchema
> = Guardian.preprocess(normalizeSendEmailRequest, _sendEmailRequest);
