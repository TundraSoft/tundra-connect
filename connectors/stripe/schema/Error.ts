import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Closed, documented set of Stripe `error.type` wire values
 * (https://docs.stripe.com/api/errors). Client-SDK-only classifications
 * some other Stripe libraries surface (e.g. "authentication_error",
 * "rate_limit_error") are derived from the HTTP status, not genuine wire
 * values, so they are intentionally not included here.
 */
export const STRIPE_ERROR_TYPES = [
  'api_error',
  'card_error',
  'idempotency_error',
  'invalid_request_error',
] as const;

/**
 * Schema for the `error` object nested inside Stripe's error envelope.
 *
 * Only `type` is guaranteed present; `code`, `param`, `decline_code`,
 * `charge`, `payment_intent`, and `doc_url` are documented as
 * situational (e.g. `decline_code` only appears for a subset of
 * `card_declined` errors). `.passthrough()` keeps any additional
 * undocumented field reachable rather than dropping it.
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived): JSR's
 * public-API "slow types" check requires the *originating* declaration of
 * any type reachable from the public API to carry an explicit annotation,
 * including a private `const` reached only via `typeof` — so the shape is
 * pinned directly here instead of threaded through an internal helper.
 */
export type StripeErrorDetailSchema = {
  /** Broad category of the error. */
  type: (typeof STRIPE_ERROR_TYPES)[number];
  /** Vendor-documented error code (https://docs.stripe.com/error-codes), when available. */
  code?: string;
  /** Human-readable description of the error. */
  message?: string;
  /** Parameter of the request that caused the error, when applicable. */
  param?: string;
  /** Card decline code, for a subset of `card_declined` errors. */
  decline_code?: string;
  /** id of the failed Charge, when applicable. */
  charge?: string;
  /** The PaymentIntent object associated with the error, when applicable. */
  payment_intent?: Record<string, unknown>;
  /** URL to more information about the error. */
  doc_url?: string;
};

/** The `error` object nested inside Stripe's error envelope. */
export const StripeErrorDetailSchemaObject: BaseGuardian<
  StripeErrorDetailSchema
> = Guardian.object({
  /** Broad category of the error. */
  type: Guardian.enum(STRIPE_ERROR_TYPES),
  /** Vendor-documented error code (https://docs.stripe.com/error-codes), when available. */
  code: Guardian.string().optional(),
  /** Human-readable description of the error. */
  message: Guardian.string().optional(),
  /** Parameter of the request that caused the error, when applicable. */
  param: Guardian.string().optional(),
  /** Card decline code, for a subset of `card_declined` errors. */
  decline_code: Guardian.string().optional(),
  /** id of the failed Charge, when applicable. */
  charge: Guardian.string().optional(),
  /** The PaymentIntent object associated with the error, when applicable. */
  payment_intent: Guardian.object().passthrough().optional(),
  /** URL to more information about the error. */
  doc_url: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Stripe error detail',
  description: "The `error` object nested inside Stripe's error envelope.",
});

/**
 * Schema for Stripe's top-level API error envelope (`{ error: {...} }`),
 * returned on non-2xx responses.
 *
 * @example
 * ```typescript
 * import { ErrorSchemaObject } from '@tundraconnect/stripe/schemas';
 *
 * const errorResponse = {
 *   error: {
 *     type: 'card_error',
 *     code: 'card_declined',
 *     message: 'Your card was declined.',
 *     decline_code: 'generic_decline',
 *   },
 * };
 *
 * const [error, validated] = ErrorSchemaObject.safeParse(errorResponse);
 * if (!error) {
 *   console.log(`Stripe error: ${validated.error.message}`);
 * }
 * ```
 */
export type ErrorSchema = {
  error: StripeErrorDetailSchema;
};

/** Documented error envelope returned by Stripe on non-2xx responses. */
export const ErrorSchemaObject: BaseGuardian<ErrorSchema> = Guardian.object({
  error: StripeErrorDetailSchemaObject,
}).describe({
  title: 'Stripe error response',
  description:
    'Documented error envelope returned by Stripe on non-2xx responses.',
});
