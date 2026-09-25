import { type BaseGuardian, Guardian } from '@guardian';
import {
  type EmailAddressSchema,
  EmailAddressSchemaObject,
  stringMapGuard,
} from '../common/mod.ts';
import {
  type PersonalizationSchema,
  PersonalizationSchemaObject,
} from './Personalization.ts';
import { type AttachmentSchema, AttachmentSchemaObject } from './Attachment.ts';
import {
  type MailSettingsSchema,
  MailSettingsSchemaObject,
} from './MailSettings.ts';
import {
  type TrackingSettingsSchema,
  TrackingSettingsSchemaObject,
} from './TrackingSettings.ts';

/** Type definition for one mail-send `content` entry. */
export interface MailContentSchema {
  /** MIME type of this body part (e.g. `text/plain`, `text/html`). */
  type: string;
  /** Body content for this part. */
  value: string;
}

/**
 * Schema for one entry of a mail-send request's `content` array
 *
 * `type` is the MIME type of the body part (e.g. `text/plain`,
 * `text/html`) and `value` is the body content itself.
 *
 * @example
 * ```typescript
 * import { MailContentSchemaObject } from '@tundraconnect/sendgrid/schemas';
 *
 * const [error, content] = MailContentSchemaObject.safeParse({
 *   type: 'text/plain',
 *   value: 'Hello!',
 * });
 * if (!error) {
 *   console.log(content.type);
 * }
 * ```
 */
export const MailContentSchemaObject: BaseGuardian<MailContentSchema> = Guardian
  .object({
    /** MIME type of this body part (e.g. `text/plain`, `text/html`). */
    type: Guardian.string().mimeType(),
    /** Body content for this part. */
    value: Guardian.string(),
  }).describe({
    title: 'Mail content',
    description: 'MIME type and body content for one message part.',
  });

/** Type definition for a mail-send request's unsubscribe group. */
export interface AsmSchema {
  /** Unsubscribe group this message belongs to. */
  group_id: number;
  /** Additional unsubscribe groups shown on the preferences page. */
  groups_to_display?: number[];
}

/**
 * Schema for a mail-send request's unsubscribe group (`asm`)
 *
 * Associates the message with a subscription-tracking unsubscribe group,
 * optionally listing the additional groups shown on the unsubscribe
 * preferences page.
 *
 * @example
 * ```typescript
 * import { AsmSchemaObject } from '@tundraconnect/sendgrid/schemas';
 *
 * const [error, asm] = AsmSchemaObject.safeParse({ group_id: 42 });
 * if (!error) {
 *   console.log(asm.group_id);
 * }
 * ```
 */
export const AsmSchemaObject: BaseGuardian<AsmSchema> = Guardian.object({
  /** Unsubscribe group this message belongs to. */
  group_id: Guardian.number().integer().positive(),
  /** Additional unsubscribe groups shown on the preferences page. */
  groups_to_display: Guardian.array(Guardian.number().integer().positive())
    .optional(),
}).describe({
  title: 'Unsubscribe group',
  description: 'Subscription-tracking unsubscribe group association.',
});

/** Type definition for the SendGrid `POST /mail/send` request body. */
export interface MailSendRequestSchema {
  /** Per-recipient envelope and substitution data; at least one is required. */
  personalizations: PersonalizationSchema[];
  /** Sender address shown to recipients. */
  from: EmailAddressSchema;
  /** Top-level subject, used when a personalization doesn't set its own. */
  subject?: string;
  /** Message body parts (e.g. `text/plain` and `text/html`). */
  content?: MailContentSchema[];
  /** Dynamic template id; supersedes `content`/`subject` when set. */
  template_id?: string;
  /** Single reply-to address. */
  reply_to?: EmailAddressSchema;
  /** Multiple reply-to addresses. */
  reply_to_list?: EmailAddressSchema[];
  /** Files attached to the message. */
  attachments?: AttachmentSchema[];
  /** Extra headers applied to every personalization. */
  headers?: Record<string, string>;
  /** Category tags for the message; SendGrid allows at most 10. */
  categories?: string[];
  /** Custom tracking arguments echoed back on webhook events. */
  custom_args?: Record<string, string>;
  /** Unix timestamp to defer the whole send. */
  send_at?: number;
  /** Groups scheduled sends for later cancellation. */
  batch_id?: string;
  /** Unsubscribe group association. */
  asm?: AsmSchema;
  /** Named IP pool to send through. */
  ip_pool_name?: string;
  /** Backend processing toggles (sandbox mode, suppression bypasses, …). */
  mail_settings?: MailSettingsSchema;
  /** Click/open/subscription/analytics tracking toggles. */
  tracking_settings?: TrackingSettingsSchema;
}

/**
 * Schema for the SendGrid `POST /mail/send` request body
 *
 * This is the primary schema of the connect: it models the full
 * transactional-email send request, composing {@link EmailAddressSchemaObject},
 * {@link PersonalizationSchemaObject}, {@link AttachmentSchemaObject},
 * {@link MailSettingsSchemaObject}, and {@link TrackingSettingsSchemaObject}.
 *
 * Two cross-field rules from the SendGrid API docs are enforced via
 * `.refine()`, since Guardian's per-field validators can't express them:
 * - A `subject` is required — either top-level or on every personalization
 *   — unless `template_id` is set (a template can supply its own subject).
 * - `content` is required unless `template_id` is set.
 *
 * @example
 * ```typescript
 * import { MailSendRequestSchemaObject } from '@tundraconnect/sendgrid/schemas';
 *
 * const [error, request] = MailSendRequestSchemaObject.safeParse({
 *   personalizations: [{ to: [{ email: 'dest@example.com' }] }],
 *   from: { email: 'sender@example.com' },
 *   subject: 'Hello',
 *   content: [{ type: 'text/plain', value: 'Hi there!' }],
 * });
 * if (!error) {
 *   console.log(request.from.email);
 * }
 * ```
 */
export const MailSendRequestSchemaObject: BaseGuardian<MailSendRequestSchema> =
  Guardian.object({
    /** Per-recipient envelope and substitution data; at least one is required. */
    personalizations: Guardian.array(PersonalizationSchemaObject).minLength(
      1,
    ),
    /** Sender address shown to recipients. */
    from: EmailAddressSchemaObject,
    /** Top-level subject, used when a personalization doesn't set its own. */
    subject: Guardian.string().optional(),
    /** Message body parts (e.g. `text/plain` and `text/html`). */
    content: Guardian.array(MailContentSchemaObject).optional(),
    /** Dynamic template id; supersedes `content`/`subject` when set. */
    template_id: Guardian.string().optional(),
    /** Single reply-to address. */
    reply_to: EmailAddressSchemaObject.optional(),
    /** Multiple reply-to addresses. */
    reply_to_list: Guardian.array(EmailAddressSchemaObject).optional(),
    /** Files attached to the message. */
    attachments: Guardian.array(AttachmentSchemaObject).optional(),
    /** Extra headers applied to every personalization. */
    headers: stringMapGuard.optional(),
    /** Category tags for the message; SendGrid allows at most 10. */
    categories: Guardian.array(Guardian.string()).maxLength(10).optional(),
    /** Custom tracking arguments echoed back on webhook events. */
    custom_args: stringMapGuard.optional(),
    /** Unix timestamp to defer the whole send. */
    send_at: Guardian.number().integer().min(0).optional(),
    /** Groups scheduled sends for later cancellation. */
    batch_id: Guardian.string().optional(),
    /** Unsubscribe group association. */
    asm: AsmSchemaObject.optional(),
    /** Named IP pool to send through. */
    ip_pool_name: Guardian.string().optional(),
    /** Backend processing toggles (sandbox mode, suppression bypasses, …). */
    mail_settings: MailSettingsSchemaObject.optional(),
    /** Click/open/subscription/analytics tracking toggles. */
    tracking_settings: TrackingSettingsSchemaObject.optional(),
  }).describe({
    title: 'Mail send request',
    description: 'Request body validated before POST /mail/send.',
  }).refine(
    (data) => {
      if (
        typeof data.template_id === 'string' && data.template_id.length > 0
      ) {
        return true;
      }
      if (typeof data.subject === 'string' && data.subject.length > 0) {
        return true;
      }
      return data.personalizations.every((p) =>
        typeof p.subject === 'string' && p.subject.length > 0
      );
    },
    'subject is required (top-level, or on every personalization) unless template_id is set',
  ).refine(
    (data) => {
      if (
        typeof data.template_id === 'string' && data.template_id.length > 0
      ) {
        return true;
      }
      return Array.isArray(data.content) && data.content.length > 0;
    },
    'content is required unless template_id is set',
  );
