import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link EmailRefSchemaObject}.
 *
 * `object` is present on update/cancel responses and absent on a send
 * response, so it is optional here and the same schema covers all three.
 */
export type EmailRefSchema = {
  /** Resend's email id — keep it to retrieve, reschedule or cancel the email. */
  id: string;
  /** Resource type, `'email'`, when Resend includes it. */
  object?: string;
};

/**
 * Schema for the small `{ id }` reference Resend returns from
 * `POST /emails`, `PATCH /emails/{id}` and `POST /emails/{id}/cancel`.
 *
 * @example
 * ```typescript
 * import { EmailRefSchemaObject } from '@tundraconnect/resend/schemas';
 *
 * const [error, ref] = EmailRefSchemaObject.safeParse({
 *   id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794',
 * });
 * ```
 */
export const EmailRefSchemaObject: BaseGuardian<EmailRefSchema> = Guardian
  .object({
    id: Guardian.string().notEmpty('Email id cannot be empty'),
    object: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'Email reference',
    description:
      'The id of a sent, rescheduled or cancelled email, as returned by the write endpoints.',
  });
