/**
 * @module @tundraconnect/sendgrid
 */

// Export main client class
export {
  SendGrid,
  type SendGridOptions,
  type SendMailResult,
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
