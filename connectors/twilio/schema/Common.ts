import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Reusable Guardian validation components shared by the Twilio request and
 * response schemas.
 *
 * These components validate the SID / phone-number / date formats Twilio
 * documents across its REST API, so each endpoint schema can compose them
 * instead of re-declaring the same patterns.
 *
 * @example
 * ```typescript
 * import { e164Guard } from '@tundraconnect/twilio/schemas';
 *
 * const [error, to] = e164Guard.safeParse('+14155552671');
 * if (!error) {
 *   console.log('Valid E.164 number:', to);
 * }
 * ```
 */

/** E.164 phone number: a leading `+`, no leading zero, 2-15 digits total. */
const E164_PATTERN = /^\+[1-9]\d{1,14}$/;

/** Twilio Account SID: `AC` followed by 32 hex characters. */
const ACCOUNT_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/;

/** Twilio Messaging Service SID: `MG` followed by 32 hex characters. */
const MESSAGING_SERVICE_SID_PATTERN = /^MG[0-9a-fA-F]{32}$/;

/** Twilio Content Template SID: `HX` followed by 32 hex characters. */
const CONTENT_SID_PATTERN = /^HX[0-9a-fA-F]{32}$/;

/** Twilio Application SID: `AP` followed by 32 hex characters. */
const APPLICATION_SID_PATTERN = /^AP[0-9a-fA-F]{32}$/;

/** Twilio Call SID: `CA` followed by 32 hex characters. */
const CALL_SID_PATTERN = /^CA[0-9a-fA-F]{32}$/;

/** Twilio BYOC (Bring Your Own Carrier) Trunk SID: `BY` followed by 32 hex characters. */
const BYOC_TRUNK_SID_PATTERN = /^BY[0-9a-fA-F]{32}$/;

/**
 * ISO 8601 UTC datetime, e.g. `2024-01-01T12:00:00Z` or
 * `2024-01-01T12:00:00.123+05:30`. Used for the `sendAt` schedule field.
 */
const ISO_8601_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Date-only, UTC, e.g. `2024-01-01`. Used for the Calls list resource's
 * `startTime`/`endTime` (and `*Before`/`*After`) filters, which Twilio
 * documents as taking a plain `YYYY-MM-DD` date rather than a full
 * datetime.
 */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const _e164Guard: BaseGuardian<string> = Guardian.string().pattern(
  E164_PATTERN,
  "Phone number must be in E.164 format (e.g. '+14155552671')",
).describe({
  title: 'E.164 phone number',
  description:
    'A phone number in E.164 format, used for the Messages `to` field.',
});

/** Type definition for a validated E.164 phone number. */
export type E164Schema = string;

/** Validates an E.164-formatted phone number (e.g. `+14155552671`). */
export const e164Guard: BaseGuardian<E164Schema> = _e164Guard;

const _accountSidGuard = Guardian.string().pattern(
  ACCOUNT_SID_PATTERN,
  "Account SID must match '^AC[0-9a-fA-F]{32}$'",
).describe({
  title: 'Account SID',
  description: 'A Twilio Account SID.',
});

/** Validates a Twilio Account SID (`AC` + 32 hex characters). */
export const accountSidGuard: BaseGuardian<string> = _accountSidGuard;

const _messagingServiceSidGuard = Guardian.string().pattern(
  MESSAGING_SERVICE_SID_PATTERN,
  "Messaging Service SID must match '^MG[0-9a-fA-F]{32}$'",
).describe({
  title: 'Messaging Service SID',
  description: 'A Twilio Messaging Service SID.',
});

/** Validates a Twilio Messaging Service SID (`MG` + 32 hex characters). */
export const messagingServiceSidGuard: BaseGuardian<string> =
  _messagingServiceSidGuard;

const _contentSidGuard = Guardian.string().pattern(
  CONTENT_SID_PATTERN,
  "Content SID must match '^HX[0-9a-fA-F]{32}$'",
).describe({
  title: 'Content SID',
  description: 'A Twilio Content Template SID.',
});

/** Validates a Twilio Content Template SID (`HX` + 32 hex characters). */
export const contentSidGuard: BaseGuardian<string> = _contentSidGuard;

const _applicationSidGuard = Guardian.string().pattern(
  APPLICATION_SID_PATTERN,
  "Application SID must match '^AP[0-9a-fA-F]{32}$'",
).describe({
  title: 'Application SID',
  description: 'A Twilio Application SID.',
});

/** Validates a Twilio Application SID (`AP` + 32 hex characters). */
export const applicationSidGuard: BaseGuardian<string> = _applicationSidGuard;

const _callSidGuard = Guardian.string().pattern(
  CALL_SID_PATTERN,
  "Call SID must match '^CA[0-9a-fA-F]{32}$'",
).describe({
  title: 'Call SID',
  description: 'A Twilio Call SID.',
});

/** Validates a Twilio Call SID (`CA` + 32 hex characters). */
export const callSidGuard: BaseGuardian<string> = _callSidGuard;

const _byocTrunkSidGuard = Guardian.string().pattern(
  BYOC_TRUNK_SID_PATTERN,
  "BYOC Trunk SID must match '^BY[0-9a-fA-F]{32}$'",
).describe({
  title: 'BYOC Trunk SID',
  description: 'A Twilio BYOC (Bring Your Own Carrier) Trunk SID.',
});

/** Validates a Twilio BYOC Trunk SID (`BY` + 32 hex characters). */
export const byocTrunkSidGuard: BaseGuardian<string> = _byocTrunkSidGuard;

const _iso8601Guard = Guardian.string().pattern(
  ISO_8601_PATTERN,
  "Date must be an ISO 8601 datetime string (e.g. '2024-01-01T12:00:00Z')",
).describe({
  title: 'ISO 8601 datetime',
  description:
    'An ISO 8601 UTC datetime string, used for the `sendAt` schedule field.',
});

/** Validates an ISO 8601 UTC datetime string (e.g. `2024-01-01T12:00:00Z`). */
export const iso8601Guard: BaseGuardian<string> = _iso8601Guard;

const _dateOnlyGuard = Guardian.string().pattern(
  DATE_ONLY_PATTERN,
  "Date must be in YYYY-MM-DD format (e.g. '2024-01-01')",
).describe({
  title: 'Date (YYYY-MM-DD)',
  description:
    'A UTC date string (no time component), used for the Calls list `startTime`/`endTime` filters.',
});

/** Validates a plain UTC date string (`YYYY-MM-DD`, no time component). */
export const dateOnlyGuard: BaseGuardian<string> = _dateOnlyGuard;

const _jsonStringGuard = Guardian.string().refine(
  (value) => {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  },
  'Value must be a JSON-encoded string',
).describe({
  title: 'JSON-encoded string',
  description:
    'A string containing a JSON-encoded object, used for `contentVariables`.',
});

/** Validates that a string is JSON-encoded (used for `contentVariables`). */
export const jsonStringGuard: BaseGuardian<string> = _jsonStringGuard;
