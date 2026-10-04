import { type BaseGuardian, Guardian } from '@guardian';

/** Most events one request may carry. */
export const MAX_EVENTS = 25;
/** Most parameters one event may carry. */
export const MAX_EVENT_PARAMS = 25;
/** Most user properties one request may carry. */
export const MAX_USER_PROPERTIES = 25;
/** Longest event name and parameter name. */
export const MAX_NAME_LENGTH = 40;
/** Longest user property name. */
export const MAX_USER_PROPERTY_NAME_LENGTH = 24;
/** Longest user property value. */
export const MAX_USER_PROPERTY_VALUE_LENGTH = 36;
/** Longest string parameter value on a standard property (500 on GA360). */
export const MAX_PARAM_VALUE_LENGTH = 100;
/** Longest string parameter value on a GA360 property. */
export const MAX_PARAM_VALUE_LENGTH_GA360 = 500;
/** Largest request body Google accepts, in bytes ("less than 130kB"). */
export const MAX_PAYLOAD_BYTES = 130_000;

/** Event names GA4 reserves; sending one is silently dropped. */
export const RESERVED_EVENT_NAMES = [
  'ad_activeview',
  'ad_click',
  'ad_exposure',
  'ad_query',
  'ad_reward',
  'adunit_exposure',
  'app_background',
  'app_clear_data',
  'app_exception',
  'app_install',
  'app_remove',
  'app_store_refund',
  'app_update',
  'app_upgrade',
  'dynamic_link_app_open',
  'dynamic_link_app_update',
  'dynamic_link_first_open',
  'error',
  'firebase_campaign',
  'firebase_in_app_message_action',
  'firebase_in_app_message_dismiss',
  'firebase_in_app_message_impression',
  'first_open',
  'first_visit',
  'in_app_purchase',
  'notification_dismiss',
  'notification_foreground',
  'notification_open',
  'notification_receive',
  'os_update',
  'session_start',
  'session_start_with_rollout',
  'user_engagement',
] as const;

/** Prefixes GA4 reserves for event names, parameter names and user properties. */
export const RESERVED_PREFIXES = ['_', 'firebase_', 'ga_', 'google_'] as const;

/** User property names GA4 reserves. */
export const RESERVED_USER_PROPERTY_NAMES = [
  'first_open_time',
  'first_visit_time',
  'last_deep_link_referrer',
  'user_id',
  'first_open_after_install',
] as const;

/** Letters, digits and underscores, starting with a letter. */
export const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Type definition for {@link EventSchemaObject}: one event. `params` is
 * free-form (strings, numbers, booleans, and arrays such as ecommerce
 * `items`); the client checks names, counts and string lengths.
 */
export type EventSchema = {
  /** Event name, e.g. `link_click`. Letters, digits, `_`; ≤ 40 characters. */
  name: string;
  /**
   * Event parameters. Add `session_id` and `engagement_time_msec` for the
   * event to count towards sessions and engagement in reports.
   */
  params?: Record<string, unknown>;
};

/**
 * Schema for one event's shape. Name rules and limits are checked by the
 * client, which can report every violation at once.
 *
 * @example
 * ```typescript
 * import { EventSchemaObject } from '@tundraconnect/google-analytics/schemas';
 *
 * const [error, event] = EventSchemaObject.safeParse({
 *   name: 'link_click',
 *   params: { link_id: 'abc', session_id: 1730000000, engagement_time_msec: 1 },
 * });
 * ```
 */
export const EventSchemaObject: BaseGuardian<EventSchema> = Guardian.object({
  name: Guardian.string().notEmpty('event `name` cannot be empty'),
  params: Guardian.object({}).passthrough().optional(),
}).describe({
  title: 'Measurement Protocol event',
  description: 'One event: a name and its parameters.',
});

/** Consent signal values. */
export type ConsentValue = 'GRANTED' | 'DENIED';

/**
 * Type definition for {@link PayloadSchemaObject}: a Measurement Protocol
 * request body, with Google's own field names.
 *
 * A web stream (`measurementId`) needs `client_id`; an app stream
 * (`firebaseAppId`) needs `app_instance_id`. The client checks that, since
 * it depends on how the client was configured.
 */
export type PayloadSchema = {
  /** The browser's client id (the `_ga` cookie value), for web streams. */
  client_id?: string;
  /** The Firebase app instance id, for app streams. */
  app_instance_id?: string;
  /** Your own id for a signed-in user. */
  user_id?: string;
  /** Unix time in microseconds; may be backdated up to 72 hours. */
  timestamp_micros?: number;
  /**
   * User properties, as `{ name: { value } }`. `value` is required; it is
   * typed optional only because an `unknown` field always is, and the
   * client rejects an entry without one.
   */
  user_properties?: Record<string, { value?: unknown }>;
  /** Consent signals for this request. */
  consent?: {
    ad_user_data?: ConsentValue;
    ad_personalization?: ConsentValue;
  };
  /** Where the user is, when you know it server-side. */
  user_location?: {
    city?: string;
    region_id?: string;
    country_id?: string;
    subcontinent_id?: string;
    continent_id?: string;
  };
  /** The user's device, when you know it server-side. */
  device?: {
    category?: string;
    language?: string;
    screen_resolution?: string;
    operating_system?: string;
    operating_system_version?: string;
    model?: string;
    brand?: string;
    browser?: string;
    browser_version?: string;
  };
  /** User-provided data (hashed email, phone, address) for enhanced matching. */
  user_data?: Record<string, unknown>;
  /** Mark the events as not for ad personalisation. */
  non_personalized_ads?: boolean;
  /** `ENFORCE_RECOMMENDATIONS` makes the debug endpoint stricter. */
  validation_behavior?: 'RELAXED' | 'ENFORCE_RECOMMENDATIONS';
  /** 1–25 events. */
  events: EventSchema[];
};

const consentValue = Guardian.enum(['GRANTED', 'DENIED'] as const);
const optionalString = () => Guardian.string().optional();

/**
 * Schema for a Measurement Protocol request body.
 *
 * @example
 * ```typescript
 * import { PayloadSchemaObject } from '@tundraconnect/google-analytics/schemas';
 *
 * const [error, payload] = PayloadSchemaObject.safeParse({
 *   client_id: '123456.7654321',
 *   events: [{ name: 'link_click', params: { link_id: 'abc' } }],
 * });
 * ```
 */
export const PayloadSchemaObject: BaseGuardian<PayloadSchema> = Guardian
  .object({
    client_id: Guardian.string().notEmpty('`client_id` cannot be empty')
      .optional(),
    app_instance_id: Guardian.string().notEmpty(
      '`app_instance_id` cannot be empty',
    ).optional(),
    user_id: Guardian.string().notEmpty('`user_id` cannot be empty')
      .optional(),
    timestamp_micros: Guardian.number().strict().integer().min(
      1,
      '`timestamp_micros` must be a positive integer',
    ).optional(),
    user_properties: Guardian.record(
      Guardian.object({ value: Guardian.unknown() }),
    ).optional(),
    consent: Guardian.object({
      ad_user_data: consentValue.optional(),
      ad_personalization: consentValue.optional(),
    }).optional(),
    user_location: Guardian.object({
      city: optionalString(),
      region_id: optionalString(),
      country_id: optionalString(),
      subcontinent_id: optionalString(),
      continent_id: optionalString(),
    }).optional(),
    device: Guardian.object({
      category: optionalString(),
      language: optionalString(),
      screen_resolution: optionalString(),
      operating_system: optionalString(),
      operating_system_version: optionalString(),
      model: optionalString(),
      brand: optionalString(),
      browser: optionalString(),
      browser_version: optionalString(),
    }).optional(),
    user_data: Guardian.object({}).passthrough().optional(),
    non_personalized_ads: Guardian.boolean().strict().optional(),
    validation_behavior: Guardian.enum(
      ['RELAXED', 'ENFORCE_RECOMMENDATIONS'] as const,
    ).optional(),
    events: Guardian.array(EventSchemaObject),
  }).describe({
    title: 'Measurement Protocol payload',
    description:
      'A GA4 Measurement Protocol request body: who (client_id / app_instance_id / user_id), when, consent, context, and 1–25 events.',
  });
