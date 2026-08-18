import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Reusable Guardian validation components shared by the Razorpay request
 * and response schemas.
 *
 * Every exported guard below carries an explicit `BaseGuardian<T>`
 * annotation (rather than relying on `GuardianInfer<typeof someGuard>` off
 * an unannotated symbol). JSR's public-API "slow types" check requires the
 * *originating* declaration of any type reachable from the public API to
 * be explicit — including a private, unexported `const` referenced only
 * via `typeof` — so inference has to be pinned right here rather than
 * threaded through an internal helper.
 */

/**
 * Razorpay `key_id`: `rzp_test_...` or `rzp_live_...`. Only the documented
 * prefix is pinned — Razorpay doesn't publish a fixed length or character
 * set for the key body.
 */
const KEY_ID_PATTERN = /^rzp_(test|live)_\S+$/;

/** Type definition for a validated Razorpay `key_id`. */
export type KeyIdSchema = string;

/** Validates a Razorpay `key_id` (the `auth.username` half of the credential pair). */
export const keyIdGuard: BaseGuardian<KeyIdSchema> = Guardian.string()
  .pattern(
    KEY_ID_PATTERN,
    "key_id must start with 'rzp_test_' or 'rzp_live_'",
  ).describe({
    title: 'Razorpay key_id',
    description:
      "A Razorpay API key id ('rzp_test_...' or 'rzp_live_...'), used as auth.username.",
  });

/**
 * Amount in the smallest unit of the currency (e.g. paise for INR, cents
 * for USD) — always a positive integer, **never** a decimal rupee/major-unit
 * amount. This is the single most common integration mistake with
 * Razorpay's API: ₹299.00 must be sent as `29900`, not `299` or `299.00`.
 * For the handful of ISO 4217 currencies with 3 decimal places (e.g. KWD),
 * Razorpay requires the last digit to be `0`; that finer constraint isn't
 * enforced here (it would require a currency-aware branch for a handful of
 * rarely-used currencies) but is called out in the docs.
 */
export type AmountSchema = number;

/** Validates a monetary amount as a positive integer in the smallest currency unit. */
export const amountGuard: BaseGuardian<AmountSchema> = Guardian.number()
  .integer()
  .positive()
  .describe({
    title: 'Amount (smallest currency unit)',
    description:
      'A positive integer amount in the smallest unit of the currency (paise for INR, cents for USD, etc.) — never a decimal major-unit amount.',
  });

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** Type definition for a validated ISO 4217 currency code. */
export type CurrencySchema = string;

/**
 * Validates an uppercase ISO 4217 currency code (e.g. `INR`). Razorpay
 * requires currency codes to be uppercase on the wire — the opposite
 * convention from this repo's Stripe connect, which requires lowercase.
 */
export const currencyGuard: BaseGuardian<CurrencySchema> = Guardian.string()
  .pattern(
    CURRENCY_PATTERN,
    "currency must be an uppercase, 3-letter ISO 4217 code (e.g. 'INR')",
  ).describe({
    title: 'ISO 4217 currency code',
    description: 'An uppercase, 3-letter ISO 4217 currency code.',
  });

/** Type definition for a validated Razorpay receipt id. */
export type ReceiptSchema = string;

/** Validates a merchant-provided receipt id (max 40 characters, per Razorpay's Orders docs). */
export const receiptGuard: BaseGuardian<ReceiptSchema> = Guardian.string()
  .maxLength(40).describe({
    title: 'Receipt number',
    description:
      'Merchant-provided receipt identifier tagged to an order, at most 40 characters.',
  });

/**
 * Free-form string key/value metadata, accepted on Orders, Payments, and
 * Payment Links. Razorpay caps it at 15 pairs with each value at most 256
 * characters (https://razorpay.com/docs/api/orders/create/).
 */
export type NotesSchema = Record<string, string>;

/** Validates a `notes` request payload: at most 15 pairs, each value at most 256 characters. */
export const notesGuard: BaseGuardian<NotesSchema> = Guardian.record(
  Guardian.string().maxLength(256),
).maxSize(15).describe({
  title: 'Notes',
  description:
    'Arbitrary key/value metadata attached to a Razorpay object — at most 15 pairs, each value at most 256 characters.',
});

/**
 * Validates a `notes` field as it comes back from Razorpay in a response.
 *
 * Razorpay's API has a well-known quirk here: when no notes were set on
 * the underlying object, several endpoints (Orders, Payments) return
 * `notes: []` — an empty **array** — instead of `{}`, even though `notes`
 * is otherwise documented and populated as a plain object. A bare
 * `Guardian.record(...)` would reject that shape outright, so this guard
 * accepts either form and normalizes the empty-array case to `{}`, keeping
 * `NotesSchema` (`Record<string, string>`) accurate for every caller
 * regardless of which shape the vendor happened to send.
 */
export const notesResponseGuard: BaseGuardian<NotesSchema> = Guardian.oneOf(
  [
    Guardian.record(Guardian.string()),
    Guardian.array(Guardian.unknown()).length(
      0,
      'a non-empty notes array is not a documented Razorpay response shape',
    ),
  ] as const,
  'notes must be an object, or an empty array',
).process((
  value,
): NotesSchema => (Array.isArray(value) ? {} : value as NotesSchema))
  .describe({
    title: 'Notes (response)',
    description:
      "Arbitrary key/value metadata as returned by Razorpay — accepts the documented object shape as well as the vendor's `[]` empty-notes quirk.",
  });
