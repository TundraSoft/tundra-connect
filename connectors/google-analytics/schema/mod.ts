/**
 * Guardian schemas behind `@tundraconnect/google-analytics`: the
 * Measurement Protocol request body and the debug endpoint's response,
 * each exported as a schema object with its TypeScript type, plus GA4's
 * documented limits and reserved names as constants.
 *
 * @example
 * ```ts
 * import { PayloadSchemaObject } from '@tundraconnect/google-analytics/schemas';
 *
 * declare const body: unknown; // e.g. a queued payload
 * const [error, payload] = PayloadSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(payload.events.length);
 * ```
 *
 * @module
 */

export {
  type ConsentValue,
  type EventSchema,
  EventSchemaObject,
  MAX_EVENT_PARAMS,
  MAX_EVENTS,
  MAX_NAME_LENGTH,
  MAX_PARAM_VALUE_LENGTH,
  MAX_PARAM_VALUE_LENGTH_GA360,
  MAX_PAYLOAD_BYTES,
  MAX_USER_PROPERTIES,
  MAX_USER_PROPERTY_NAME_LENGTH,
  MAX_USER_PROPERTY_VALUE_LENGTH,
  NAME_PATTERN,
  type PayloadSchema,
  PayloadSchemaObject,
  RESERVED_EVENT_NAMES,
  RESERVED_PREFIXES,
  RESERVED_USER_PROPERTY_NAMES,
} from './Payload.ts';
export {
  VALIDATION_CODES,
  type ValidationMessageSchema,
  ValidationMessageSchemaObject,
  type ValidationResponseSchema,
  ValidationResponseSchemaObject,
} from './Validation.ts';
