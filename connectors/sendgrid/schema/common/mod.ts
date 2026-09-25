/** Common schema components shared across SendGrid request/response schemas. */
export {
  type EmailAddressSchema,
  EmailAddressSchemaObject,
  stringMapGuard,
} from './Common.ts';

export {
  type ErrorItemSchema,
  ErrorItemSchemaObject,
  type ErrorSchema,
  ErrorSchemaObject,
} from './Error.ts';
