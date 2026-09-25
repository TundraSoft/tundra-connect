import { type BaseGuardian, Guardian } from '@guardian';

/** Documented lifecycle states of a Twilio Message resource. */
export const MESSAGE_STATUSES = [
  'queued',
  'sending',
  'sent',
  'failed',
  'delivered',
  'undelivered',
  'receiving',
  'received',
  'accepted',
  'scheduled',
  'read',
  'partially_delivered',
  'canceled',
] as const;

/** Documented direction values of a Twilio Message resource. */
export const MESSAGE_DIRECTIONS = [
  'inbound',
  'outbound-api',
  'outbound-call',
  'outbound-reply',
] as const;

/**
 * Schema for the Twilio Message resource
 *
 * Validates the response body returned by
 * `POST /2010-04-01/Accounts/{AccountSid}/Messages.json`. Several fields
 * that look numeric on the wire (`num_media`, `num_segments`, `price`) are
 * documented — and modelled here — as strings, not numbers.
 *
 * @example
 * ```typescript
 * import { MessageSchemaObject } from '@tundraconnect/twilio/schemas';
 *
 * const [error, message] = MessageSchemaObject.safeParse({
 *   sid: 'SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
 *   account_sid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
 *   api_version: '2010-04-01',
 *   body: 'Hello!',
 *   from: '+15017122661',
 *   to: '+14155552671',
 *   messaging_service_sid: null,
 *   status: 'queued',
 *   direction: 'outbound-api',
 *   date_created: 'Thu, 01 Jan 2024 12:00:00 +0000',
 *   date_sent: null,
 *   date_updated: 'Thu, 01 Jan 2024 12:00:00 +0000',
 *   error_code: null,
 *   error_message: null,
 *   num_media: '0',
 *   num_segments: '1',
 *   price: null,
 *   price_unit: null,
 *   uri: '/2010-04-01/Accounts/ACxx/Messages/SMxx.json',
 *   subresource_uris: { media: '/2010-04-01/Accounts/ACxx/Messages/SMxx/Media.json' },
 * });
 * if (!error) {
 *   console.log('Message SID:', message.sid);
 * }
 * ```
 */
export type MessageSchema = {
  sid: string;
  account_sid: string;
  api_version: string;
  body: string;
  from: string;
  to: string;
  messaging_service_sid: string | null;
  status: (typeof MESSAGE_STATUSES)[number];
  direction: (typeof MESSAGE_DIRECTIONS)[number];
  date_created: string;
  date_sent: string | null;
  date_updated: string;
  error_code: number | null;
  error_message: string | null;
  num_media: string;
  num_segments: string;
  price: string | null;
  price_unit: string | null;
  uri: string;
  subresource_uris: Record<string, string>;
};

const _messageSchema: BaseGuardian<MessageSchema> = Guardian.object({
  /** Unique identifier of the message (`SM` + 32 hex characters). */
  sid: Guardian.string(),
  /** Account SID that sent the message. */
  account_sid: Guardian.string(),
  /** Twilio API version used to process the message. */
  api_version: Guardian.string(),
  /** Message text. */
  body: Guardian.string(),
  /** Sender phone number, alphanumeric sender ID, or short code. */
  from: Guardian.string(),
  /** Recipient phone number. */
  to: Guardian.string(),
  /** Messaging Service SID the message was sent through, if any. */
  messaging_service_sid: Guardian.string().nullable(),
  /** Current delivery status. */
  status: Guardian.enum(MESSAGE_STATUSES),
  /** Direction of the message relative to the account. */
  direction: Guardian.enum(MESSAGE_DIRECTIONS),
  /** RFC 2822 timestamp the resource was created. */
  date_created: Guardian.string(),
  /**
   * RFC 2822 timestamp the message was actually sent. `null` until Twilio
   * hands the message to a carrier — the response to `sendMessage()` is
   * typically still `queued`/`accepted`, so this is commonly `null` at
   * that point.
   */
  date_sent: Guardian.string().nullable(),
  /** RFC 2822 timestamp the resource was last updated. */
  date_updated: Guardian.string(),
  /** Twilio error code, when `status` is `failed` or `undelivered`. */
  error_code: Guardian.number().integer().nullable(),
  /** Human-readable description of `error_code`. */
  error_message: Guardian.string().nullable(),
  /** Number of media items attached, as a string (e.g. `'0'`). */
  num_media: Guardian.string(),
  /** Number of message segments the body was split into, as a string. */
  num_segments: Guardian.string(),
  /** Amount billed for the message, as a string; `null` until priced. */
  price: Guardian.string().nullable(),
  /** ISO 4217 currency code `price` is denominated in. */
  price_unit: Guardian.string().nullable(),
  /** Relative URI of this resource. */
  uri: Guardian.string(),
  /** Relative URIs of subresources (e.g. `media`, `feedback`). */
  subresource_uris: Guardian.record(Guardian.string()),
}).describe({
  title: 'Message resource',
  description: 'A Twilio Message resource, returned by the Messages endpoint.',
});

/** Guardian schema that validates a {@link MessageSchema}. */
export const MessageSchemaObject: BaseGuardian<MessageSchema> = _messageSchema;
