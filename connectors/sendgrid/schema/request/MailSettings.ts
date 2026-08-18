import { type BaseGuardian, Guardian } from '@guardian';

/** Shared `{ enable: boolean }` toggle used by several mail settings. */
interface _ToggleSchema {
  enable: boolean;
}

const ToggleSchemaObject: BaseGuardian<_ToggleSchema> = Guardian.object({
  enable: Guardian.boolean(),
});

/** Type definition for SendGrid mail-send `mail_settings`. */
export interface MailSettingsSchema {
  /** Validate the request without delivering it; returns 200 instead of 202. */
  sandbox_mode?: _ToggleSchema;
  /** Skip list-management processing (suppression, unsubscribe groups, …). */
  bypass_list_management?: _ToggleSchema;
  /** Skip spam-report suppression checks. */
  bypass_spam_management?: _ToggleSchema;
  /** Skip bounce suppression checks. */
  bypass_bounce_management?: _ToggleSchema;
  /** Skip unsubscribe suppression checks. */
  bypass_unsubscribe_management?: _ToggleSchema;
  /** Append a footer to the message body. */
  footer?: {
    enable: boolean;
    text?: string;
    html?: string;
  };
}

/**
 * Schema for SendGrid mail-send `mail_settings`
 *
 * Validates the backend processing toggles a mail-send request may set,
 * including `sandbox_mode` — the flag that makes SendGrid validate the
 * request without delivering it and return `200 OK` instead of the normal
 * `202 Accepted` (see `SendGrid.sendMail` and `MailSend.ts`).
 *
 * @example
 * ```typescript
 * import { MailSettingsSchemaObject } from '@tundraconnect/sendgrid/schemas';
 *
 * const [error, settings] = MailSettingsSchemaObject.safeParse({
 *   sandbox_mode: { enable: true },
 * });
 * if (!error) {
 *   console.log(settings.sandbox_mode?.enable);
 * }
 * ```
 */
export const MailSettingsSchemaObject: BaseGuardian<MailSettingsSchema> =
  Guardian.object({
    /** Validate the request without delivering it; returns 200 instead of 202. */
    sandbox_mode: ToggleSchemaObject.optional(),
    /** Skip list-management processing (suppression, unsubscribe groups, …). */
    bypass_list_management: ToggleSchemaObject.optional(),
    /** Skip spam-report suppression checks. */
    bypass_spam_management: ToggleSchemaObject.optional(),
    /** Skip bounce suppression checks. */
    bypass_bounce_management: ToggleSchemaObject.optional(),
    /** Skip unsubscribe suppression checks. */
    bypass_unsubscribe_management: ToggleSchemaObject.optional(),
    /** Append a footer to the message body. */
    footer: Guardian.object({
      enable: Guardian.boolean(),
      text: Guardian.string().optional(),
      html: Guardian.string().optional(),
    }).optional(),
  }).describe({
    title: 'Mail settings',
    description: 'Backend processing toggles for a mail-send request.',
  });
