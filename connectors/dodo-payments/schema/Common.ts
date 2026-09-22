import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Lifecycle states a payment intent can be in. `succeeded` is the ONLY
 * value that means money moved — see {@link IntentStatusSchema}'s note on
 * why `processing` must never be treated as payment.
 */
export const INTENT_STATUSES = [
  'succeeded',
  'failed',
  'cancelled',
  'processing',
  'requires_customer_action',
  'requires_merchant_action',
  'requires_payment_method',
  'requires_confirmation',
  'requires_capture',
  'partially_captured',
  'partially_captured_and_capturable',
] as const;

/**
 * Type definition for {@link IntentStatusSchemaObject}.
 *
 * Only `succeeded` means the payment completed. Every other value —
 * `processing` and the `requires_*` family especially — means the money
 * has NOT settled; treating them as success is the classic way to ship
 * goods for free.
 */
export type IntentStatusSchema = typeof INTENT_STATUSES[number];

/**
 * Schema for a payment intent's status.
 *
 * @example
 * ```typescript
 * import { IntentStatusSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, status] = IntentStatusSchemaObject.safeParse('succeeded');
 * ```
 */
export const IntentStatusSchemaObject: BaseGuardian<IntentStatusSchema> =
  Guardian.enum(INTENT_STATUSES).describe({
    title: 'Payment intent status',
    description:
      'Lifecycle state of a payment intent. Only `succeeded` means funds captured.',
  });

/** Lifecycle states a subscription can be in. */
export const SUBSCRIPTION_STATUSES = [
  'pending',
  'active',
  'on_hold',
  'paused',
  'cancelled',
  'failed',
  'expired',
  'past_due',
] as const;

/** Type definition for {@link SubscriptionStatusSchemaObject}. */
export type SubscriptionStatusSchema = typeof SUBSCRIPTION_STATUSES[number];

/**
 * Schema for a subscription's status.
 *
 * @example
 * ```typescript
 * import { SubscriptionStatusSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, status] = SubscriptionStatusSchemaObject.safeParse('active');
 * ```
 */
export const SubscriptionStatusSchemaObject: BaseGuardian<
  SubscriptionStatusSchema
> = Guardian.enum(SUBSCRIPTION_STATUSES).describe({
  title: 'Subscription status',
  description: 'Lifecycle state of a subscription.',
});

/** Type definition for {@link BillingAddressSchemaObject}. */
export type BillingAddressSchema = {
  /** ISO 3166-1 alpha-2 country code, e.g. `US`. Required by the vendor. */
  country: string;
  city?: string | null;
  state?: string | null;
  street?: string | null;
  zipcode?: string | null;
};

/**
 * Schema for a billing address. Only `country` is required — Dodo is a
 * merchant of record and derives tax treatment from it.
 *
 * @example
 * ```typescript
 * import { BillingAddressSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, billing] = BillingAddressSchemaObject.safeParse({
 *   country: 'US',
 *   city: 'Austin',
 * });
 * ```
 */
export const BillingAddressSchemaObject: BaseGuardian<BillingAddressSchema> =
  Guardian.object({
    country: Guardian.string().notEmpty('`billing.country` is required'),
    city: Guardian.string().nullable().optional(),
    state: Guardian.string().nullable().optional(),
    street: Guardian.string().nullable().optional(),
    zipcode: Guardian.string().nullable().optional(),
  }).passthrough().describe({
    title: 'Billing address',
    description: 'Billing address; `country` drives merchant-of-record tax.',
  });

/** Type definition for {@link CustomerDetailsSchemaObject}. */
export type CustomerDetailsSchema = {
  customer_id: string;
  email: string;
  name: string;
  phone_number?: string | null;
  metadata?: Record<string, string>;
};

/**
 * Schema for the customer summary embedded in a payment or subscription.
 *
 * @example
 * ```typescript
 * import { CustomerDetailsSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, customer] = CustomerDetailsSchemaObject.safeParse({
 *   customer_id: 'cus_1',
 *   email: 'a@example.com',
 *   name: 'Ada',
 * });
 * ```
 */
export const CustomerDetailsSchemaObject: BaseGuardian<CustomerDetailsSchema> =
  Guardian.object({
    customer_id: Guardian.string(),
    email: Guardian.string(),
    name: Guardian.string(),
    phone_number: Guardian.string().nullable().optional(),
    metadata: Guardian.record(Guardian.string()).optional(),
  }).passthrough().describe({
    title: 'Customer details',
    description: 'Customer summary embedded in a payment or subscription.',
  });

/**
 * Type definition for {@link CustomerRequestSchemaObject} — how a caller
 * identifies the customer when CREATING a payment or subscription.
 *
 * Either an existing `customer_id`, or a new customer by `email`
 * (+ optional `name`/`phone_number`). The vendor models this as a union,
 * and so does this schema: passing neither is rejected locally rather than
 * producing an opaque 422.
 */
export type CustomerRequestSchema =
  | { customer_id: string }
  | { email: string; name?: string | null; phone_number?: string | null };

/**
 * Schema for the `customer` field of a create request.
 *
 * @example
 * ```typescript
 * import { CustomerRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * CustomerRequestSchemaObject.safeParse({ customer_id: 'cus_1' });
 * CustomerRequestSchemaObject.safeParse({ email: 'a@example.com', name: 'Ada' });
 * ```
 */
export const CustomerRequestSchemaObject: BaseGuardian<CustomerRequestSchema> =
  Guardian.oneOf(
    [
      Guardian.object({
        customer_id: Guardian.string().notEmpty(),
      }),
      Guardian.object({
        email: Guardian.string().email(),
        name: Guardian.string().nullable().optional(),
        phone_number: Guardian.string().nullable().optional(),
      }),
    ],
    '`customer` must be either { customer_id } or { email, name?, phone_number? }',
  );
