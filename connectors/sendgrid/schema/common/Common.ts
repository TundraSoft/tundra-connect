import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Common schema components for the SendGrid mail-send request
 *
 * Reusable Guardian validators shared across the mail-send sub-schemas
 * (`Personalization`, `MailSend`, …), so the same email-address and
 * freeform-map shapes aren't redefined in every file.
 *
 * @example
 * ```typescript
 * import { EmailAddressSchemaObject, stringMapGuard } from '@tundraconnect/sendgrid/schemas';
 *
 * const customSchema = Guardian.object({
 *   from: EmailAddressSchemaObject,
 *   headers: stringMapGuard.optional(),
 * });
 * ```
 */

/**
 * Reusable `Record<string, string>` guard for the freeform header,
 * substitution, and custom-argument maps SendGrid accepts in several
 * places (`personalizations[].headers`, `custom_args`, …).
 */
export const stringMapGuard: BaseGuardian<Record<string, string>> = Guardian
  .record(Guardian.string());

/** Type definition for a SendGrid email address. */
export interface EmailAddressSchema {
  /** The email address. */
  email: string;
  /** Optional display name shown alongside the address. */
  name?: string;
}

/**
 * Schema for a SendGrid email address
 *
 * Validates the `{ email, name? }` shape used for `from`, `reply_to`,
 * and every recipient list (`to` / `cc` / `bcc`) across the mail-send
 * request.
 *
 * @example
 * ```typescript
 * import { EmailAddressSchemaObject } from '@tundraconnect/sendgrid/schemas';
 *
 * const [error, address] = EmailAddressSchemaObject.safeParse({
 *   email: 'sender@example.com',
 *   name: 'Example Sender',
 * });
 * if (!error) {
 *   console.log(address.email);
 * }
 * ```
 */
export const EmailAddressSchemaObject: BaseGuardian<EmailAddressSchema> =
  Guardian.object({
    /** The email address. */
    email: Guardian.string().email(),
    /** Optional display name shown alongside the address. */
    name: Guardian.string().optional(),
  }).describe({
    title: 'Email address',
    description: 'An email address and optional display name.',
  });
