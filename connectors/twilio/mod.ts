/**
 * Typed, cross-runtime client for the [Twilio REST
 * API](https://www.twilio.com/docs/usage/api), covering SMS/MMS sending via the
 * Messages resource and voice calls via the Calls resource.
 *
 * Typed Twilio client: send SMS/MMS; place, list, update and delete voice
 * calls; and verify webhook signatures.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`TwilioError` and its code registry).
 *
 * @example
 * ```ts
 * import { Twilio } from '@tundraconnect/twilio';
 *
 * const client = new Twilio({
 *   accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
 *   authToken: 'your-auth-token',
 * });
 *
 * const message = await client.sendMessage({
 *   to: '+14155552671',
 *   from: '+15017122661',
 *   body: 'Hello from Twilio!',
 * });
 *
 * console.log(message.sid, message.status);
 *
 * const call = await client.createCall({
 *   to: '+14155552671',
 *   from: '+15017122661',
 *   url: 'http://demo.twilio.com/docs/voice.xml',
 * });
 *
 * console.log(call.sid, call.status);
 * ```
 *
 * @module
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
