import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';
import {
  applicationSidGuard,
  contentSidGuard,
  e164Guard,
  iso8601Guard,
  jsonStringGuard,
  messagingServiceSidGuard,
} from './Common.ts';

/**
 * Schema for {@link Twilio.sendMessage} request options
 *
 * Validates the camelCase options object accepted by `sendMessage()` before
 * it is translated into Twilio's PascalCase form-encoded fields. Twilio
 * requires one of `from` / `messagingServiceSid` (the sender) and one of
 * `body` / `mediaUrl` / `contentSid` (the content) — both constraints are
 * enforced here so a malformed request never reaches the API.
 *
 * @example
 * ```typescript
 * import { SendMessageRequestSchemaObject } from '@tundraconnect/twilio/schemas';
 *
 * const [error, options] = SendMessageRequestSchemaObject.safeParse({
 *   to: '+14155552671',
 *   from: '+15017122661',
 *   body: 'Hello from Twilio!',
 * });
 * if (!error) {
 *   console.log('Valid request:', options.to);
 * }
 * ```
 */
type _SendMessageRequestShape = {
  to: string;
  from?: string;
  messagingServiceSid?: string;
  body?: string;
  mediaUrl?: string[];
  contentSid?: string;
  statusCallback?: string;
  applicationSid?: string;
  validityPeriod?: number;
  smartEncoded?: boolean;
  shortenUrls?: boolean;
  scheduleType?: 'fixed';
  sendAt?: string;
  contentVariables?: string;
};

const _sendMessageRequestSchema: BaseGuardian<_SendMessageRequestShape> =
  Guardian.object({
    /** Recipient phone number, in E.164 format. */
    to: e164Guard,
    /** Sender phone number or alphanumeric sender ID. One of `from` / `messagingServiceSid` is required. */
    from: Guardian.string().minLength(1).optional(),
    /** Messaging Service SID to send through. One of `from` / `messagingServiceSid` is required. */
    messagingServiceSid: messagingServiceSidGuard.optional(),
    /** Message text (max 1600 characters). One of `body` / `mediaUrl` / `contentSid` is required. */
    body: Guardian.string().maxLength(1600).optional(),
    /** Media URLs to attach (MMS). One of `body` / `mediaUrl` / `contentSid` is required. */
    mediaUrl: Guardian.array(Guardian.string().url()).minLength(
      1,
      'mediaUrl must contain at least one URL when supplied',
    ).optional(),
    /** Content Template SID. One of `body` / `mediaUrl` / `contentSid` is required. */
    contentSid: contentSidGuard.optional(),
    /** Webhook URL Twilio calls as the message status changes. */
    statusCallback: Guardian.string().url().optional(),
    /** Application SID whose `message_status_callback` receives status updates. */
    applicationSid: applicationSidGuard.optional(),
    /** Seconds the message is valid for, before Twilio stops attempting delivery (1-36000). */
    validityPeriod: Guardian.number().integer().min(1).max(36000).optional(),
    /** Whether to detect and use the most efficient text encoding. */
    smartEncoded: Guardian.boolean().optional(),
    /** Whether to shorten links in the message body and track their engagement. */
    shortenUrls: Guardian.boolean().optional(),
    /** Message scheduling type. Only `'fixed'` is currently documented. */
    scheduleType: Guardian.enum(['fixed'] as const).optional(),
    /** ISO 8601 UTC datetime to schedule the message for (requires `scheduleType: 'fixed'`). */
    sendAt: iso8601Guard.optional(),
    /** JSON-encoded object of variables to substitute into a Content Template. */
    contentVariables: jsonStringGuard.optional(),
  }).refine(
    (data) => Boolean(data.from) || Boolean(data.messagingServiceSid),
    "Either 'from' or 'messagingServiceSid' is required",
  ).refine(
    (data) =>
      Boolean(data.body) ||
      (Array.isArray(data.mediaUrl) && data.mediaUrl.length > 0) ||
      Boolean(data.contentSid),
    "At least one of 'body', 'mediaUrl', or 'contentSid' is required",
  ).describe({
    title: 'Send message request',
    description:
      'Options accepted by Twilio.sendMessage(), validated before the API call.',
  });

/** Type definition for {@link Twilio.sendMessage} request options. */
export type SendMessageRequestSchema = GuardianInfer<
  typeof _sendMessageRequestSchema
>;

export const SendMessageRequestSchemaObject: BaseGuardian<
  SendMessageRequestSchema
> = _sendMessageRequestSchema;
