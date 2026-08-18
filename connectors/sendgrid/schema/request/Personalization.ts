import { type BaseGuardian, Guardian } from '@guardian';
import {
  type EmailAddressSchema,
  EmailAddressSchemaObject,
  stringMapGuard,
} from '../common/mod.ts';

/** Type definition for a SendGrid mail-send personalization. */
export interface PersonalizationSchema {
  /** Primary recipients — at least one is required. */
  to: EmailAddressSchema[];
  /** Carbon-copy recipients. */
  cc?: EmailAddressSchema[];
  /** Blind carbon-copy recipients. */
  bcc?: EmailAddressSchema[];
  /** Subject for this personalization; overrides the top-level `subject`. */
  subject?: string;
  /** Extra headers merged into the message sent to this personalization. */
  headers?: Record<string, string>;
  /** Legacy substitution tag -> replacement value map. */
  substitutions?: Record<string, string>;
  /** Dynamic template variables (used with `template_id`). */
  dynamic_template_data?: Record<string, unknown>;
  /** Custom tracking arguments echoed back on webhook events. */
  custom_args?: Record<string, string>;
  /** Unix timestamp to defer this personalization's send. */
  send_at?: number;
  /** Sender address override for this personalization. */
  from?: EmailAddressSchema;
}

/**
 * Schema for a SendGrid mail-send personalization
 *
 * Validates one entry of the `personalizations` array on a mail-send
 * request — the per-recipient envelope (`to`/`cc`/`bcc`), substitutions,
 * template data, and scheduling for a single send. At least one
 * personalization with at least one `to` recipient is required by the
 * mail-send request as a whole; see `MailSend.ts`.
 *
 * @example
 * ```typescript
 * import { PersonalizationSchemaObject } from '@tundraconnect/sendgrid/schemas';
 *
 * const [error, personalization] = PersonalizationSchemaObject.safeParse({
 *   to: [{ email: 'dest@example.com', name: 'Destination' }],
 *   subject: 'Hello',
 * });
 * if (!error) {
 *   console.log(personalization.to[0].email);
 * }
 * ```
 */
export const PersonalizationSchemaObject: BaseGuardian<
  PersonalizationSchema
> = Guardian.object({
  /** Primary recipients — at least one is required. */
  to: Guardian.array(EmailAddressSchemaObject).minLength(1),
  /** Carbon-copy recipients. */
  cc: Guardian.array(EmailAddressSchemaObject).optional(),
  /** Blind carbon-copy recipients. */
  bcc: Guardian.array(EmailAddressSchemaObject).optional(),
  /** Subject for this personalization; overrides the top-level `subject`. */
  subject: Guardian.string().optional(),
  /** Extra headers merged into the message sent to this personalization. */
  headers: stringMapGuard.optional(),
  /** Legacy substitution tag -> replacement value map. */
  substitutions: stringMapGuard.optional(),
  /** Dynamic template variables (used with `template_id`). */
  dynamic_template_data: Guardian.record(Guardian.unknown()).optional(),
  /** Custom tracking arguments echoed back on webhook events. */
  custom_args: stringMapGuard.optional(),
  /** Unix timestamp to defer this personalization's send. */
  send_at: Guardian.number().integer().min(0).optional(),
  /** Sender address override for this personalization. */
  from: EmailAddressSchemaObject.optional(),
}).describe({
  title: 'Personalization',
  description:
    'Per-recipient envelope, substitutions, and scheduling for one send.',
});
