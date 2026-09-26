import { type BaseGuardian, Guardian } from '@guardian';
import { type AttachmentSchema, AttachmentSchemaObject } from './Attachment.ts';
import { type TagSchema, TagSchemaObject } from './Tag.ts';

/** Resend's documented ceiling on `to` recipients for one email. */
export const MAX_RECIPIENTS = 50;

/**
 * Loose sender check: a bare address (`a@b.com`) or a display-name form
 * (`Acme <a@b.com>`). Resend accepts both; a strict `.email()` would reject
 * the display-name form, which is what most senders actually use.
 */
export const SENDER_PATTERN: RegExp =
  /^(?:[^<>]*<\s*[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+\s*>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;

/** Resend's rule for a template variable's name. */
const TEMPLATE_KEY_PATTERN = /^[A-Za-z0-9_]{1,50}$/;

/** Resend's rule for a template variable's value. */
function isTemplateVariableValue(value: unknown): boolean {
  if (typeof value === 'string') return value.length <= 2000;
  return typeof value === 'number' && Number.isFinite(value) &&
    Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

/** Type definition for {@link TemplateSchemaObject}. */
export type TemplateSchema = {
  /** Published template id or alias. */
  id: string;
  /** Values for the template's variables. */
  variables?: Record<string, string | number>;
};

/**
 * Schema for a send request's `template` — a published Resend template and
 * the values of its variables.
 *
 * @example
 * ```typescript
 * import { TemplateSchemaObject } from '@tundraconnect/resend/schemas';
 *
 * const [error, template] = TemplateSchemaObject.safeParse({
 *   id: 'order-confirmation',
 *   variables: { name: 'Ada', total: 42 },
 * });
 * ```
 */
export const TemplateSchemaObject: BaseGuardian<TemplateSchema> = Guardian
  .object({
    id: Guardian.string().notEmpty('`template.id` cannot be empty'),
    variables: Guardian.record(
      // `Guardian.unknown()` + an explicit `typeof` check rather than
      // `oneOf([string(), number()])`: Guardian's string guard coerces, so
      // a boolean would silently go out as `"true"` instead of failing.
      Guardian.unknown().test(
        isTemplateVariableValue,
        'Template variable values must be strings of at most 2,000 characters or safe integers/finite numbers',
      ).process((value) => value as string | number),
    ).test(
      (vars) =>
        Object.keys(vars).every((key) => TEMPLATE_KEY_PATTERN.test(key)),
      'Template variable names must be 1-50 ASCII letters, digits or underscores',
    ).optional(),
  }).describe({
    title: 'Email template',
    description:
      'A published Resend template id or alias, plus the values of its variables.',
  });

/**
 * Type definition for {@link SendEmailRequestSchemaObject} — the WIRE shape.
 *
 * `to`/`cc`/`bcc`/`reply_to` are always arrays here. Callers may pass a
 * bare string for any of them; the schema normalizes that to a
 * single-element array before validating.
 */
export type SendEmailRequestSchema = {
  /** Sender — `you@yourdomain.com` or `Your Name <you@yourdomain.com>`, on a verified domain. */
  from: string;
  /** Recipients — at least one, at most {@link MAX_RECIPIENTS}. */
  to: string[];
  /** Subject line. */
  subject: string;
  /** Carbon-copy recipients. */
  cc?: string[];
  /** Blind-carbon-copy recipients. */
  bcc?: string[];
  /** Reply-to address(es). */
  reply_to?: string[];
  /** HTML body. */
  html?: string;
  /** Plain-text body. Resend derives one from `html` when omitted. */
  text?: string;
  /** Custom email headers. */
  headers?: Record<string, string>;
  /** Attachments — not supported on batch sends. */
  attachments?: AttachmentSchema[];
  /** Custom tags, echoed back on retrieval and in webhooks. */
  tags?: TagSchema[];
  /**
   * Send later — ISO 8601 (`2026-08-05T11:52:01Z`) or natural language
   * (`in 1 hour`). Not supported on batch sends.
   */
  scheduled_at?: string;
  /** Topic id governing contact subscription preferences. */
  topic_id?: string;
  /** A published template to render instead of `html`/`text`. */
  template?: TemplateSchema;
};

/** Coerces a bare string recipient field into the single-element array the wire expects. */
function toArray(value: unknown): unknown {
  return typeof value === 'string' ? [value] : value;
}

/**
 * Normalizes a caller-supplied send request into the wire shape.
 *
 * Done as ONE top-level `Guardian.preprocess` over the whole object: a
 * preprocess guardian used as an `Guardian.object()` field's value
 * silently skips its transform (see
 * `connectors/cloudflare-email/schema/SendEmailRequest.ts`).
 */
function normalizeSendEmailRequest(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  for (const key of ['to', 'cc', 'bcc', 'reply_to'] as const) {
    if (obj[key] !== undefined) out[key] = toArray(obj[key]);
  }
  return out;
}

const _sendEmailRequest = Guardian.object({
  from: Guardian.string().pattern(
    SENDER_PATTERN,
    '`from` must be `email@domain` or `Name <email@domain>`',
  ),
  to: Guardian.array(Guardian.string().email())
    .nonEmpty('At least one `to` recipient is required')
    .maxLength(
      MAX_RECIPIENTS,
      `\`to\` is limited to ${MAX_RECIPIENTS} recipients`,
    ),
  subject: Guardian.string().notEmpty('`subject` cannot be empty'),
  cc: Guardian.array(Guardian.string().email()).optional(),
  bcc: Guardian.array(Guardian.string().email()).optional(),
  reply_to: Guardian.array(Guardian.string().email()).optional(),
  html: Guardian.string().optional(),
  text: Guardian.string().optional(),
  headers: Guardian.record(Guardian.string()).optional(),
  attachments: Guardian.array(AttachmentSchemaObject).optional(),
  tags: Guardian.array(TagSchemaObject).optional(),
  scheduled_at: Guardian.string().notEmpty('`scheduled_at` cannot be empty')
    .optional(),
  topic_id: Guardian.string().notEmpty('`topic_id` cannot be empty')
    .optional(),
  template: TemplateSchemaObject.optional(),
}).describe({
  title: 'Send email request',
  description:
    'Body for POST /emails — sender, recipients, subject, a body (html, text or template), and optional cc/bcc/reply-to/headers/attachments/tags/schedule.',
});

/**
 * Schema for the `POST /emails` request body.
 *
 * Accepts a bare string for `to`/`cc`/`bcc`/`reply_to` — as Resend itself
 * does — and normalizes it to an array.
 *
 * The cross-field rule "one of `html`, `text` or `template`" is NOT
 * enforced here; `Resend.send` and `Resend.sendBatch` check it before the
 * request goes out.
 *
 * @example
 * ```typescript
 * import { SendEmailRequestSchemaObject } from '@tundraconnect/resend/schemas';
 *
 * const [error, body] = SendEmailRequestSchemaObject.safeParse({
 *   from: 'Acme <onboarding@yourdomain.com>',
 *   to: 'recipient@example.com', // normalized to ['recipient@example.com']
 *   subject: 'Welcome!',
 *   html: '<p>Thanks for signing up.</p>',
 * });
 * ```
 */
export const SendEmailRequestSchemaObject: BaseGuardian<
  SendEmailRequestSchema
> = Guardian.preprocess(normalizeSendEmailRequest, _sendEmailRequest);
