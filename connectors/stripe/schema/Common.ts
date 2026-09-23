import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Reusable Guardian validation components shared by the Stripe request and
 * response schemas.
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
 * Stripe secret/restricted API key: `sk_` (secret) or `rk_` (restricted),
 * each with a `test_`/`live_` environment segment (e.g. `sk_test_51...`,
 * `rk_live_...`). Only the stable, documented prefix is pinned — Stripe
 * doesn't publish a fixed total length or character set for the key body,
 * and it has grown over the years, so anchoring on the full key shape
 * would risk rejecting a legitimately-issued key.
 */
const SECRET_KEY_PATTERN = /^(sk|rk)_(test|live)_\S+$/;

/** Type definition for a validated Stripe secret key. */
export type SecretKeySchema = string;

/** Validates a Stripe secret or restricted API key. */
export const secretKeyGuard: BaseGuardian<SecretKeySchema> = Guardian.string()
  .pattern(
    SECRET_KEY_PATTERN,
    "secretKey must start with 'sk_test_', 'sk_live_', 'rk_test_', or 'rk_live_'",
  ).describe({
    title: 'Stripe secret key',
    description:
      "A Stripe secret or restricted API key ('sk_'/'rk_' + 'test_'/'live_' + the key body).",
  });

/** Validates a Stripe PaymentIntent id (`pi_...`). */
export const paymentIntentIdGuard: BaseGuardian<string> = Guardian.string()
  .pattern(
    // Alphanumeric ONLY after the prefix. `\S+` admitted `/` and `.`, so
    // `pi_../../v1/customers` passed validation and escaped its path
    // segment into a different authenticated endpoint.
    /^pi_[A-Za-z0-9]+$/,
    "PaymentIntent id must match '^pi_[A-Za-z0-9]+$'",
  ).describe({
    title: 'PaymentIntent id',
    description: 'A Stripe PaymentIntent identifier, e.g. `pi_3Nx...`.',
  });

/**
 * Validates a lowercase ISO 4217 currency code (e.g. `usd`). Stripe
 * requires currency codes to be lowercase on the wire.
 */
export const currencyGuard: BaseGuardian<string> = Guardian.string().pattern(
  /^[a-z]{3}$/,
  "currency must be a lowercase, 3-letter ISO 4217 code (e.g. 'usd')",
).describe({
  title: 'ISO 4217 currency code',
  description: 'A lowercase, 3-letter ISO 4217 currency code.',
});

/**
 * Free-form string key/value metadata, accepted on every Stripe resource
 * that supports it (`metadata[key]=value` once form-encoded).
 */
export const metadataGuard: BaseGuardian<Record<string, string>> = Guardian
  .record(Guardian.string()).describe({
    title: 'Metadata',
    description:
      'Arbitrary string key/value pairs attached to a Stripe object.',
  });
