import { type BaseGuardian, Guardian } from '@guardian';

/** Type definition for SendGrid mail-send `tracking_settings`. */
export interface TrackingSettingsSchema {
  /** Rewrite links in the message body to track clicks. */
  click_tracking?: {
    enable: boolean;
    enable_text?: boolean;
  };
  /** Insert a tracking pixel to record opens. */
  open_tracking?: {
    enable: boolean;
    substitution_tag?: string;
  };
  /** Append an unsubscribe link/footer and track subscription changes. */
  subscription_tracking?: {
    enable: boolean;
    text?: string;
    html?: string;
    substitution_tag?: string;
  };
  /** Tag click-through links for Google Analytics. */
  ganalytics?: {
    enable: boolean;
    utm_source?: string;
    utm_medium?: string;
    utm_term?: string;
    utm_content?: string;
    utm_campaign?: string;
  };
}

/**
 * Schema for SendGrid mail-send `tracking_settings`
 *
 * Validates the click/open/subscription/analytics tracking toggles a
 * mail-send request may set.
 *
 * @example
 * ```typescript
 * import { TrackingSettingsSchemaObject } from '@tundraconnect/sendgrid/schemas';
 *
 * const [error, settings] = TrackingSettingsSchemaObject.safeParse({
 *   click_tracking: { enable: false },
 *   open_tracking: { enable: true },
 * });
 * if (!error) {
 *   console.log(settings.open_tracking?.enable);
 * }
 * ```
 */
export const TrackingSettingsSchemaObject: BaseGuardian<
  TrackingSettingsSchema
> = Guardian.object({
  /** Rewrite links in the message body to track clicks. */
  click_tracking: Guardian.object({
    enable: Guardian.boolean(),
    enable_text: Guardian.boolean().optional(),
  }).optional(),
  /** Insert a tracking pixel to record opens. */
  open_tracking: Guardian.object({
    enable: Guardian.boolean(),
    substitution_tag: Guardian.string().optional(),
  }).optional(),
  /** Append an unsubscribe link/footer and track subscription changes. */
  subscription_tracking: Guardian.object({
    enable: Guardian.boolean(),
    text: Guardian.string().optional(),
    html: Guardian.string().optional(),
    substitution_tag: Guardian.string().optional(),
  }).optional(),
  /** Tag click-through links for Google Analytics. */
  ganalytics: Guardian.object({
    enable: Guardian.boolean(),
    utm_source: Guardian.string().optional(),
    utm_medium: Guardian.string().optional(),
    utm_term: Guardian.string().optional(),
    utm_content: Guardian.string().optional(),
    utm_campaign: Guardian.string().optional(),
  }).optional(),
}).describe({
  title: 'Tracking settings',
  description:
    'Click, open, subscription, and analytics tracking toggles for a mail-send request.',
});
