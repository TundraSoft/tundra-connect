/** Request-payload schemas for the SendGrid mail-send endpoint. */
export { type AttachmentSchema, AttachmentSchemaObject } from './Attachment.ts';

export {
  type PersonalizationSchema,
  PersonalizationSchemaObject,
} from './Personalization.ts';

export {
  type MailSettingsSchema,
  MailSettingsSchemaObject,
} from './MailSettings.ts';

export {
  type TrackingSettingsSchema,
  TrackingSettingsSchemaObject,
} from './TrackingSettings.ts';

export {
  type AsmSchema,
  AsmSchemaObject,
  type MailContentSchema,
  MailContentSchemaObject,
  type MailSendRequestSchema,
  MailSendRequestSchemaObject,
} from './MailSend.ts';
