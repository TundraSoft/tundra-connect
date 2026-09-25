/**
 * Guardian schemas behind `@tundraconnect/twilio`: every request and response
 * shape the client validates, each exported as a schema object with its
 * inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { CallSchemaObject } from '@tundraconnect/twilio/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = CallSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export {
  accountSidGuard,
  applicationSidGuard,
  byocTrunkSidGuard,
  callSidGuard,
  contentSidGuard,
  dateOnlyGuard,
  e164Guard,
  type E164Schema,
  iso8601Guard,
  jsonStringGuard,
  messagingServiceSidGuard,
} from './Common.ts';

export {
  type SendMessageRequestSchema,
  SendMessageRequestSchemaObject,
} from './SendMessageRequest.ts';

export {
  MESSAGE_DIRECTIONS,
  MESSAGE_STATUSES,
  type MessageSchema,
  MessageSchemaObject,
} from './Message.ts';

export {
  CALL_DIRECTIONS,
  CALL_STATUSES,
  type CallSchema,
  CallSchemaObject,
} from './Call.ts';

export {
  type CreateCallRequestSchema,
  CreateCallRequestSchemaObject,
} from './CreateCallRequest.ts';

export {
  type UpdateCallRequestSchema,
  UpdateCallRequestSchemaObject,
} from './UpdateCallRequest.ts';

export {
  type ListCallsRequestSchema,
  ListCallsRequestSchemaObject,
  type ListCallsResponseSchema,
  ListCallsResponseSchemaObject,
} from './ListCalls.ts';

export { type ErrorSchema, ErrorSchemaObject } from './Error.ts';
