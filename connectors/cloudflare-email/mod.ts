/**
 * Send transactional email through Cloudflare's Email Sending REST API
 * (`POST /accounts/{account_id}/email/sending/send`), with local validation
 * of addresses, attachments and recipient limits before anything leaves your
 * process.
 *
 * Typed Cloudflare Email Sending client: send transactional email with
 * attachments, validated locally before the request is made.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`CloudflareEmailError` and its code registry).
 *
 * @example
 * ```ts
 * import { CloudflareEmail } from '@tundraconnect/cloudflare-email';
 * import { CloudflareEmailError } from '@tundraconnect/cloudflare-email/errors';
 *
 * const client = new CloudflareEmail({
 *   accountId: Deno.env.get('CF_ACCOUNT_ID')!,
 *   auth: {
 *     type: 'BEARER',
 *     token: Deno.env.get('CF_API_TOKEN')!,
 *     prefix: 'Bearer',
 *   },
 * });
 *
 * try {
 *   const result = await client.send({
 *     // "Name <address>" is sent as { address, name } — a display name.
 *     from: 'Billing <billing@yourdomain.com>',
 *     // A single address works too — both forms appear in Cloudflare's own docs.
 *     to: [{ address: 'customer@example.com', name: 'Jane Customer' }],
 *     cc: 'accounts@yourdomain.com',
 *     reply_to: 'support@yourdomain.com',
 *     subject: 'Your invoice',
 *     text: 'Your invoice is attached.',
 *     headers: { 'X-Campaign-ID': 'invoices' },
 *     attachments: [{
 *       content: btoa('invoice body'), // base64, NOT a data: URI
 *       filename: 'invoice.txt',
 *       type: 'text/plain',
 *     }],
 *   });
 *
 *   console.log('delivered:', result.delivered);
 *   console.log('queued:', result.queued);
 *   console.log('bounced:', result.permanent_bounces);
 * } catch (err) {
 *   if (err instanceof CloudflareEmailError) {
 *     // Branch on the stable code name, never on a message substring.
 *     if (err.code === 'RATE_LIMITED') {
 *       // back off and retry
 *     }
 *     console.error(err.code, err.getContextValue('vendorCode'));
 *   }
 *   throw err;
 * }
 * ```
 *
 * @module
 */

// Export main client class
export {
  CloudflareEmail,
  type CloudflareEmailAuth,
  type CloudflareEmailOptions,
  type SendEmailOptions,
} from './CloudflareEmail.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
