import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link WebhookEventSchemaObject}.
 *
 * `data` is left as an open record: its shape depends on `type` (an
 * `email.*` event carries `email_id`, `to`, `subject`, ...; a `domain.*`
 * event carries the domain), and Resend adds event types over time.
 */
export type WebhookEventSchema = {
  /** Event type, e.g. `email.delivered`, `email.bounced`, `domain.updated`. */
  type: string;
  /** When the event occurred, ISO 8601. */
  created_at: string;
  /** Event-specific payload. */
  data: Record<string, unknown>;
};

/**
 * Schema for a verified Resend webhook payload — what
 * `Resend.verifyWebhook` resolves to.
 *
 * @example
 * ```typescript
 * import { WebhookEventSchemaObject } from '@tundraconnect/resend/schemas';
 *
 * const [error, event] = WebhookEventSchemaObject.safeParse({
 *   type: 'email.delivered',
 *   created_at: '2026-02-22T23:41:12.126Z',
 *   data: { email_id: '56761188-7520-42d8-8898-ff6fc54ce618' },
 * });
 * ```
 */
export const WebhookEventSchemaObject: BaseGuardian<WebhookEventSchema> =
  Guardian.object({
    type: Guardian.string().notEmpty('Webhook event `type` cannot be empty'),
    created_at: Guardian.string(),
    data: Guardian.record(Guardian.unknown()),
  }).passthrough().describe({
    title: 'Webhook event',
    description:
      'A Resend webhook delivery: the event type, when it happened, and its type-specific data.',
  });
