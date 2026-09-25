import { type BaseGuardian, Guardian } from '@guardian';

/** Type definition for {@link VerifyWebhookResponseSchemaObject}. */
export type VerifyWebhookResponseSchema = {
  /** `SUCCESS` when PayPal confirms it signed the transmission; `FAILURE` otherwise. */
  verification_status: 'SUCCESS' | 'FAILURE';
};

/**
 * Schema for the `POST /v1/notifications/verify-webhook-signature`
 * response — PayPal verifies its own signature server-side and answers
 * with a single status word.
 *
 * @example
 * ```typescript
 * import { VerifyWebhookResponseSchemaObject } from '@tundraconnect/paypal/schemas';
 *
 * const [error, result] = VerifyWebhookResponseSchemaObject.safeParse({
 *   verification_status: 'SUCCESS',
 * });
 * ```
 */
export const VerifyWebhookResponseSchemaObject: BaseGuardian<
  VerifyWebhookResponseSchema
> = Guardian.object({
  verification_status: Guardian.enum(['SUCCESS', 'FAILURE'] as const),
}).passthrough().describe({
  title: 'Verify webhook signature response',
  description: "PayPal's server-side verdict on a webhook transmission.",
});
