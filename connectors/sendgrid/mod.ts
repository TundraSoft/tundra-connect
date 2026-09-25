/**
 * Typed, cross-runtime client for the [Twilio SendGrid v3
 * API](https://www.twilio.com/docs/sendgrid).
 *
 * Typed Twilio SendGrid client: send transactional email, inspect API-key
 * scopes, and verify ECDSA-signed event webhooks.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`SendGridError` and its code registry).
 *
 * @example
 * ```ts
 * import { SendGrid } from '@tundraconnect/sendgrid';
 *
 * const client = new SendGrid({
 *   auth: { type: 'BEARER', token: 'SG.xxxxx', prefix: 'Bearer' },
 * });
 *
 * const { messageId } = await client.sendMail({
 *   personalizations: [{ to: [{ email: 'dest@example.com' }] }],
 *   from: { email: 'sender@example.com' },
 *   subject: 'Hello from SendGrid',
 *   content: [{ type: 'text/plain', value: 'Hi there!' }],
 * });
 *
 * console.log(messageId);
 * ```
 *
 * @module
 */

// Export main client class
export {
  SendGrid,
  type SendGridAuth,
  type SendGridOptions,
  type SendMailResult,
  type VerifyWebhookOptions,
  type WebhookHeadersLike,
} from './SendGrid.ts';

// Export error handling
export * from './errors/mod.ts';

// Export all schema types and objects for advanced usage
export {
  type AsmSchema,
  AsmSchemaObject,
  type AttachmentSchema,
  AttachmentSchemaObject,
  type EmailAddressSchema,
  EmailAddressSchemaObject,
  type ErrorItemSchema,
  ErrorItemSchemaObject,
  type ErrorSchema,
  ErrorSchemaObject,
  type MailContentSchema,
  MailContentSchemaObject,
  type MailSendRequestSchema,
  MailSendRequestSchemaObject,
  type MailSettingsSchema,
  MailSettingsSchemaObject,
  type PersonalizationSchema,
  PersonalizationSchemaObject,
  type ScopesResponseSchema,
  ScopesResponseSchemaObject,
  stringMapGuard,
  type TrackingSettingsSchema,
  TrackingSettingsSchemaObject,
} from './schema/mod.ts';
