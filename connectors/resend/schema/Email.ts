import { type BaseGuardian, Guardian } from '@guardian';
import { type TagSchema, TagSchemaObject } from './Tag.ts';

/**
 * Type definition for {@link EmailSchemaObject}.
 *
 * Nullable fields are the ones Resend documents as `null` when unset
 * (`text`, `scheduled_at`, ...), so a caller has to handle absence
 * explicitly rather than being handed an `undefined` it never checked for.
 */
export type EmailSchema = {
  /** Resource type, `'email'`. */
  object: string;
  /** Resend's email id. */
  id: string;
  /** Recipients. */
  to: string[];
  /** Sender, as sent (may include a display name). */
  from: string;
  /** Creation time as Resend formats it, e.g. `2026-04-03 22:13:42.674981+00`. */
  created_at: string;
  /** Subject line. */
  subject: string;
  /** HTML body, or `null`. */
  html?: string | null;
  /** Plain-text body, or `null`. */
  text?: string | null;
  /** Carbon-copy recipients, or `null`. */
  cc?: string[] | null;
  /** Blind-carbon-copy recipients, or `null`. */
  bcc?: string[] | null;
  /** Reply-to addresses, or `null`. */
  reply_to?: string[] | null;
  /**
   * Latest delivery event — e.g. `sent`, `delivered`, `delivery_delayed`,
   * `bounced`, `complained`, `opened`, `clicked`, `scheduled`, `canceled`,
   * `failed`, `suppressed`. Kept an open string: Resend adds event types
   * over time, and a retrieval should not start failing when it does.
   */
  last_event: string;
  /** When a scheduled email will send, or `null`. */
  scheduled_at?: string | null;
  /** RFC 5322 `Message-ID` Resend assigned, when available. */
  message_id?: string | null;
  /** Custom tags supplied at send time. */
  tags?: TagSchema[] | null;
};

/**
 * Schema for a retrieved email — `GET /emails/{id}`.
 *
 * Unknown keys pass through so an additive vendor field never turns a
 * successful retrieval into a `RESPONSE_ERROR`.
 *
 * @example
 * ```typescript
 * import { EmailSchemaObject } from '@tundraconnect/resend/schemas';
 *
 * const [error, email] = EmailSchemaObject.safeParse({
 *   object: 'email',
 *   id: '4ef9a417-02e9-4d39-ad75-9611e0fcc33c',
 *   to: ['delivered@resend.dev'],
 *   from: 'Acme <onboarding@resend.dev>',
 *   created_at: '2026-04-03 22:13:42.674981+00',
 *   subject: 'Hello World',
 *   html: '<p>Hi</p>',
 *   text: null,
 *   last_event: 'delivered',
 * });
 * ```
 */
export const EmailSchemaObject: BaseGuardian<EmailSchema> = Guardian.object({
  object: Guardian.string(),
  id: Guardian.string(),
  to: Guardian.array(Guardian.string()),
  from: Guardian.string(),
  created_at: Guardian.string(),
  subject: Guardian.string(),
  html: Guardian.string().nullable().optional(),
  text: Guardian.string().nullable().optional(),
  cc: Guardian.array(Guardian.string()).nullable().optional(),
  bcc: Guardian.array(Guardian.string()).nullable().optional(),
  reply_to: Guardian.array(Guardian.string()).nullable().optional(),
  last_event: Guardian.string(),
  scheduled_at: Guardian.string().nullable().optional(),
  message_id: Guardian.string().nullable().optional(),
  tags: Guardian.array(TagSchemaObject).nullable().optional(),
}).passthrough().describe({
  title: 'Email',
  description:
    'A sent or scheduled email as returned by GET /emails/{id}, including its latest delivery event.',
});
