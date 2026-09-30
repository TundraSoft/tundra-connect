/**
 * Send transactional email through Resend (`https://api.resend.com`):
 * single and batch sends with idempotency keys, delivery-status lookups,
 * rescheduling and cancelling scheduled email, and Svix webhook
 * verification — validated locally before anything leaves your process.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`ResendError` and its code registry).
 *
 * @example
 * ```ts
 * import { Resend } from '@tundraconnect/resend';
 * import { ResendError } from '@tundraconnect/resend/errors';
 *
 * const client = new Resend({
 *   auth: { type: 'BEARER', token: Deno.env.get('RESEND_API_KEY')! },
 * });
 *
 * try {
 *   const { id } = await client.send(
 *     {
 *       from: 'Acme <welcome@yourdomain.com>',
 *       to: 'customer@example.com',
 *       subject: 'Welcome to Acme',
 *       html: '<p>Thanks for signing up.</p>',
 *       tags: [{ name: 'user_id', value: 'user_123' }],
 *     },
 *     { idempotencyKey: 'welcome-user_123' },
 *   );
 *   console.log('sent', id);
 * } catch (err) {
 *   if (err instanceof ResendError && err.code === 'RATE_LIMITED') {
 *     // back off and retry with the same idempotency key
 *   }
 *   throw err;
 * }
 * ```
 *
 * @module
 */

// Export main client class
export {
  DEFAULT_USER_AGENT,
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  MAX_BATCH_SIZE,
  Resend,
  RESEND_API,
  type ResendAuth,
  type ResendOptions,
  type SendEmailOptions,
  type SendRequestOptions,
  type VerifyWebhookOptions,
  type WebhookHeadersLike,
} from './Resend.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
