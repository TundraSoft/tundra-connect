/**
 * The error model of `@tundraconnect/google-analytics`. Every failure the
 * client throws is a `GoogleAnalyticsError`; its readonly `code` is a key of
 * `GoogleAnalyticsErrorCodes`, and `transient` says whether retrying later
 * can help. The API secret never appears in an error's message or context.
 *
 * Note that the Measurement Protocol answers `2xx` even for payloads it will
 * drop, so a successful `send()` is not proof the events were recorded —
 * use `validate()` while developing.
 *
 * @example
 * ```ts
 * import { GoogleAnalyticsError } from '@tundraconnect/google-analytics/errors';
 *
 * declare function sendTheEvents(): Promise<unknown>;
 *
 * try {
 *   await sendTheEvents();
 * } catch (err) {
 *   if (err instanceof GoogleAnalyticsError && err.transient) {
 *     // queue the events and try again later
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export {
  GoogleAnalyticsError,
  type GoogleAnalyticsErrorMetadata,
} from './Base.ts';
export {
  GOOGLE_ANALYTICS_TRANSIENT_CODES,
  type GoogleAnalyticsErrorCode,
  GoogleAnalyticsErrorCodes,
} from './GoogleAnalyticsErrorCodes.ts';
