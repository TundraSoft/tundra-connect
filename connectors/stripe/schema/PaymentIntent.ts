import { type BaseGuardian, Guardian } from '@guardian';
import { currencyGuard, metadataGuard } from './Common.ts';

/** Documented lifecycle states of a Stripe PaymentIntent. */
export const PAYMENT_INTENT_STATUSES = [
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
  'requires_capture',
  'canceled',
  'succeeded',
] as const;

/** Documented `capture_method` values. */
export const CAPTURE_METHODS = [
  'automatic',
  'automatic_async',
  'manual',
] as const;

/** Documented `confirmation_method` values. */
export const CONFIRMATION_METHODS = ['automatic', 'manual'] as const;

/** Documented `setup_future_usage` values. */
export const SETUP_FUTURE_USAGE_VALUES = ['off_session', 'on_session'] as const;

/**
 * Schema for {@link Stripe.createPaymentIntent} request options.
 *
 * Only `amount` and `currency` are required; every other field mirrors a
 * commonly-used PaymentIntent create parameter. `payment_method_types` and
 * `automatic_payment_methods` are mutually exclusive on Stripe's side — that
 * constraint is intentionally not enforced here (it would complicate local
 * validation for little benefit); supplying both surfaces as a vendor
 * `invalid_request_error` instead.
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived): JSR's
 * public-API "slow types" check requires the *originating* declaration of
 * any type reachable from the public API to carry an explicit annotation,
 * including a private `const` reached only via `typeof` — so the shape is
 * pinned directly here instead of threaded through an internal helper.
 *
 * @example
 * ```typescript
 * import { CreatePaymentIntentRequestSchemaObject } from '@tundraconnect/stripe/schemas';
 *
 * const [error, options] = CreatePaymentIntentRequestSchemaObject.safeParse({
 *   amount: 1999,
 *   currency: 'usd',
 *   automatic_payment_methods: { enabled: true },
 * });
 * if (!error) {
 *   console.log('Valid request:', options.amount);
 * }
 * ```
 */
export type CreatePaymentIntentRequestSchema = {
  /** Amount to charge, in the smallest currency unit (e.g. cents for USD). */
  amount: number;
  /** Lowercase ISO 4217 currency code, e.g. `'usd'`. */
  currency: string;
  /** Lets Stripe pick payment methods automatically for this PaymentIntent. */
  automatic_payment_methods?: {
    enabled: boolean;
    allow_redirects?: 'always' | 'never';
  };
  /** Explicit list of payment method types to allow. */
  payment_method_types?: string[];
  /** Customer this PaymentIntent belongs to. */
  customer?: string;
  /** Description shown to the customer and in the Dashboard. */
  description?: string;
  /** Arbitrary string key/value metadata. */
  metadata?: Record<string, string>;
  /** Whether to confirm the PaymentIntent immediately after creation. */
  confirm?: boolean;
  /** Payment method to attach to this PaymentIntent. */
  payment_method?: string;
  /** When to capture funds: automatically, asynchronously, or manually. */
  capture_method?: (typeof CAPTURE_METHODS)[number];
  /** Email address to send the receipt to. */
  receipt_email?: string;
  /** Indicates the payment method may be used again for future payments. */
  setup_future_usage?: (typeof SETUP_FUTURE_USAGE_VALUES)[number];
};

/** Options accepted by {@link Stripe.createPaymentIntent}, validated before the API call. */
export const CreatePaymentIntentRequestSchemaObject: BaseGuardian<
  CreatePaymentIntentRequestSchema
> = Guardian.object({
  amount: Guardian.number().integer().positive(),
  currency: currencyGuard,
  automatic_payment_methods: Guardian.object({
    enabled: Guardian.boolean(),
    allow_redirects: Guardian.enum(['always', 'never'] as const).optional(),
  }).optional(),
  payment_method_types: Guardian.array(Guardian.string()).optional(),
  customer: Guardian.string().optional(),
  description: Guardian.string().optional(),
  metadata: metadataGuard.optional(),
  confirm: Guardian.boolean().optional(),
  payment_method: Guardian.string().optional(),
  capture_method: Guardian.enum(CAPTURE_METHODS).optional(),
  receipt_email: Guardian.string().optional(),
  setup_future_usage: Guardian.enum(SETUP_FUTURE_USAGE_VALUES).optional(),
}).describe({
  title: 'Create PaymentIntent request',
  description:
    'Options accepted by Stripe.createPaymentIntent(), validated before the API call.',
});

/**
 * Schema for the Stripe PaymentIntent resource.
 *
 * Models the commonly-used subset of Stripe's ~40-field PaymentIntent
 * object rather than every documented field; `.passthrough()` keeps any
 * unmodeled field reachable at runtime (just untyped) instead of silently
 * dropping it — `.passthrough()` doesn't widen the *type* though
 * (`ObjectGuardian.passthrough()` returns `this`), so
 * `PaymentIntentSchema` below only lists the modeled fields, same as
 * before. `last_payment_error` and `next_action` are validated loosely
 * (`.passthrough()`) since their shape varies by error/action type.
 *
 * @example
 * ```typescript
 * import { PaymentIntentSchemaObject } from '@tundraconnect/stripe/schemas';
 *
 * const [error, intent] = PaymentIntentSchemaObject.safeParse({
 *   id: 'pi_3Nx0aB2c3D4e5F6g',
 *   object: 'payment_intent',
 *   amount: 1999,
 *   amount_capturable: 0,
 *   amount_received: 0,
 *   currency: 'usd',
 *   status: 'requires_payment_method',
 *   client_secret: 'pi_3Nx0aB2c3D4e5F6g_secret_abc',
 *   created: 1700000000,
 *   customer: null,
 *   description: null,
 *   livemode: false,
 *   metadata: {},
 *   payment_method: null,
 *   payment_method_types: ['card'],
 *   capture_method: 'automatic',
 *   confirmation_method: 'automatic',
 *   last_payment_error: null,
 *   latest_charge: null,
 *   next_action: null,
 * });
 * if (!error) {
 *   console.log('PaymentIntent status:', intent.status);
 * }
 * ```
 */
export type PaymentIntentSchema = {
  /** Unique identifier of the PaymentIntent (`pi_...`). */
  id: string;
  /** Object type discriminator. */
  object: 'payment_intent';
  /** Amount to charge, in the smallest currency unit. */
  amount: number;
  /** Amount that can still be captured on this PaymentIntent. */
  amount_capturable: number;
  /** Amount that has actually been collected. */
  amount_received: number;
  /** Lowercase ISO 4217 currency code. */
  currency: string;
  /** Current lifecycle status. */
  status: (typeof PAYMENT_INTENT_STATUSES)[number];
  /** Client-side secret used to complete the payment on the frontend. */
  client_secret: string | null;
  /** Unix timestamp (seconds) the PaymentIntent was created. */
  created: number;
  /** Customer this PaymentIntent belongs to, if any. */
  customer: string | null;
  /** Description shown to the customer and in the Dashboard. */
  description: string | null;
  /** Whether this object exists in live mode or test mode. */
  livemode: boolean;
  /** Arbitrary string key/value metadata. */
  metadata: Record<string, string>;
  /** Payment method attached to this PaymentIntent, if any. */
  payment_method: string | null;
  /** Payment method types allowed for this PaymentIntent. */
  payment_method_types: string[];
  /** When funds are captured. */
  capture_method: (typeof CAPTURE_METHODS)[number];
  /** Whether confirmation happens automatically or must be triggered explicitly. */
  confirmation_method: (typeof CONFIRMATION_METHODS)[number];
  /** Most recent payment error, if the last attempt failed. */
  last_payment_error: Record<string, unknown> | null;
  /** Latest Charge resource created for this PaymentIntent, if any. */
  latest_charge: string | null;
  /** Action the customer must take to complete the payment, if any. */
  next_action: Record<string, unknown> | null;
};

/** A Stripe PaymentIntent resource (commonly-used subset), returned by the PaymentIntents endpoints. */
export const PaymentIntentSchemaObject: BaseGuardian<PaymentIntentSchema> =
  Guardian.object({
    id: Guardian.string(),
    object: Guardian.literal('payment_intent'),
    amount: Guardian.number().integer(),
    amount_capturable: Guardian.number().integer(),
    amount_received: Guardian.number().integer(),
    currency: Guardian.string(),
    status: Guardian.enum(PAYMENT_INTENT_STATUSES),
    client_secret: Guardian.string().nullable(),
    created: Guardian.number().integer(),
    customer: Guardian.string().nullable(),
    description: Guardian.string().nullable(),
    livemode: Guardian.boolean(),
    metadata: Guardian.record(Guardian.string()),
    payment_method: Guardian.string().nullable(),
    payment_method_types: Guardian.array(Guardian.string()),
    capture_method: Guardian.enum(CAPTURE_METHODS),
    confirmation_method: Guardian.enum(CONFIRMATION_METHODS),
    last_payment_error: Guardian.object().passthrough().nullable(),
    latest_charge: Guardian.string().nullable(),
    next_action: Guardian.object().passthrough().nullable(),
  }).passthrough().describe({
    title: 'PaymentIntent resource',
    description:
      'A Stripe PaymentIntent resource (commonly-used subset), returned by the PaymentIntents endpoints.',
  });
