/**
 * @module @tundraconnect/twilio
 */

// Export main client class
export { Twilio, type TwilioOptions } from './Twilio.ts';

// Export error handling
export * from './errors/mod.ts';

// Export all schema types and objects for advanced usage
export {
  accountSidGuard,
  applicationSidGuard,
  byocTrunkSidGuard,
  CALL_DIRECTIONS,
  CALL_STATUSES,
  type CallSchema,
  CallSchemaObject,
  callSidGuard,
  contentSidGuard,
  type CreateCallRequestSchema,
  CreateCallRequestSchemaObject,
  dateOnlyGuard,
  e164Guard,
  type E164Schema,
  type ErrorSchema,
  ErrorSchemaObject,
  iso8601Guard,
  jsonStringGuard,
  type ListCallsRequestSchema,
  ListCallsRequestSchemaObject,
  type ListCallsResponseSchema,
  ListCallsResponseSchemaObject,
  MESSAGE_DIRECTIONS,
  MESSAGE_STATUSES,
  type MessageSchema,
  MessageSchemaObject,
  messagingServiceSidGuard,
  type SendMessageRequestSchema,
  SendMessageRequestSchemaObject,
  type UpdateCallRequestSchema,
  UpdateCallRequestSchemaObject,
} from './schema/mod.ts';
