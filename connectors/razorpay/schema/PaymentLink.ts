import { type BaseGuardian, Guardian } from '@guardian';
import {
  amountGuard,
  currencyGuard,
  notesGuard,
  notesResponseGuard,
} from './Common.ts';

/** Documented lifecycle states of a Razorpay Payment Link. */
export const PAYMENT_LINK_STATUSES = [
  'created',
  'partially_paid',
  'paid',
  'expired',
  'cancelled',
] as const;

/** Schema for the `customer` object accepted by / returned on a Payment Link. */
export type PaymentLinkCustomerSchema = {
  /** Customer's name. */
  name?: string;
  /** Customer's contact number. */
  contact?: string;
  /** Customer's email address. */
  email?: string;
};

/** Validates the `customer` object on a Payment Link create request/response. */
export const PaymentLinkCustomerSchemaObject: BaseGuardian<
  PaymentLinkCustomerSchema
> = Guardian.object({
  name: Guardian.string().optional(),
  contact: Guardian.string().optional(),
  email: Guardian.string().optional(),
}).describe({
  title: 'Payment Link customer',
  description: 'Prefill details for the customer paying a Payment Link.',
});

/** Schema for the `notify` object accepted by a Payment Link create request. */
export type PaymentLinkNotifySchema = {
  /** Whether Razorpay should send an SMS notification. */
  sms?: boolean;
  /** Whether Razorpay should send an email notification. */
  email?: boolean;
};

/** Validates the `notify` object on a Payment Link create request. */
export const PaymentLinkNotifySchemaObject: BaseGuardian<
  PaymentLinkNotifySchema
> = Guardian.object({
  sms: Guardian.boolean().optional(),
  email: Guardian.boolean().optional(),
}).describe({
  title: 'Payment Link notify',
  description: 'Which channels Razorpay should use to notify the customer.',
});

/**
 * Schema for {@link Razorpay.createPaymentLink} request options
 * (https://razorpay.com/docs/api/payments/payment-links/create-standard/).
 *
 * Only `amount` is required; `currency` defaults to `'INR'` on Razorpay's
 * side when omitted. `callback_method` must be `'get'` when `callback_url`
 * is supplied — Razorpay documents `'get'` as the only supported value, so
 * it's modeled as a literal rather than a free-form string.
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived): JSR's
 * public-API "slow types" check requires the *originating* declaration of
 * any type reachable from the public API to carry an explicit annotation.
 *
 * @example
 * ```typescript
 * import { CreatePaymentLinkRequestSchemaObject } from '@tundraconnect/razorpay/schemas';
 *
 * const [error, options] = CreatePaymentLinkRequestSchemaObject.safeParse({
 *   amount: 29900,
 *   description: 'Payment for order #1',
 *   customer: { name: 'Gaurav Kumar', email: 'gaurav.kumar@example.com' },
 *   notify: { sms: true, email: true },
 * });
 * if (!error) {
 *   console.log('Valid request:', options.amount);
 * }
 * ```
 */
export type CreatePaymentLinkRequestSchema = {
  /** Amount to collect, in the smallest currency unit. */
  amount: number;
  /** Uppercase ISO 4217 currency code — defaults to `'INR'` on Razorpay's side when omitted. */
  currency?: string;
  /** Brief description of the Payment Link, at most 2048 characters. */
  description?: string;
  /** Prefilled customer details. */
  customer?: PaymentLinkCustomerSchema;
  /** Notification channels to use. */
  notify?: PaymentLinkNotifySchema;
  /** Whether to send payment reminders. Defaults to `false`. */
  reminder_enable?: boolean;
  /** URL to redirect the customer to after a successful payment. */
  callback_url?: string;
  /** Must be `'get'` when `callback_url` is supplied. */
  callback_method?: 'get';
  /** Whether to accept a partial payment. Defaults to `false`. */
  accept_partial?: boolean;
  /** Minimum amount accepted for a partial payment. */
  first_min_partial_amount?: number;
  /** Merchant-provided reference id, at most 40 characters, unique per link. */
  reference_id?: string;
  /** Unix timestamp (seconds) the link expires — at most 6 months from creation. */
  expire_by?: number;
  /** Arbitrary string key/value metadata — at most 15 pairs, each value at most 256 characters. */
  notes?: Record<string, string>;
};

/** Options accepted by {@link Razorpay.createPaymentLink}, validated before the API call. */
export const CreatePaymentLinkRequestSchemaObject: BaseGuardian<
  CreatePaymentLinkRequestSchema
> = Guardian.object({
  amount: amountGuard,
  currency: currencyGuard.optional(),
  description: Guardian.string().maxLength(2048).optional(),
  customer: PaymentLinkCustomerSchemaObject.optional(),
  notify: PaymentLinkNotifySchemaObject.optional(),
  reminder_enable: Guardian.boolean().optional(),
  callback_url: Guardian.string().optional(),
  callback_method: Guardian.literal('get').optional(),
  accept_partial: Guardian.boolean().optional(),
  first_min_partial_amount: Guardian.number().integer().positive().optional(),
  reference_id: Guardian.string().maxLength(40).optional(),
  expire_by: Guardian.number().integer().positive().optional(),
  notes: notesGuard.optional(),
}).describe({
  title: 'Create Payment Link request',
  description:
    'Options accepted by Razorpay.createPaymentLink(), validated before the API call.',
});

/**
 * Schema for the Razorpay Payment Link resource
 * (https://razorpay.com/docs/api/payments/payment-links/create-standard/#response-parameters).
 *
 * Models the commonly-used subset of fields; `.passthrough()` keeps any
 * unmodeled field (e.g. `user_id`, `options`, `payments`, `reminders`)
 * reachable at runtime, just untyped.
 *
 * @example
 * ```typescript
 * import { PaymentLinkSchemaObject } from '@tundraconnect/razorpay/schemas';
 *
 * const [error, link] = PaymentLinkSchemaObject.safeParse({
 *   id: 'plink_JXPUQu6ftD5WLu',
 *   short_url: 'https://rzp.io/i/nxrHnLJ',
 *   status: 'created',
 *   amount: 29900,
 *   amount_paid: 0,
 *   currency: 'INR',
 *   created_at: 1600188707,
 *   expire_by: null,
 * });
 * if (!error) {
 *   console.log('Payment link:', link.short_url);
 * }
 * ```
 */
export type PaymentLinkSchema = {
  /** Unique identifier of the Payment Link (`plink_...`). */
  id: string;
  /** Short, shareable URL for the Payment Link. */
  short_url: string;
  /** Current lifecycle status. */
  status: (typeof PAYMENT_LINK_STATUSES)[number];
  /** Payment Link amount, in the smallest currency unit. */
  amount: number;
  /** Amount paid against this link so far. */
  amount_paid: number;
  /** Uppercase ISO 4217 currency code. */
  currency: string;
  /** Unix timestamp (seconds) the link was created. */
  created_at: number;
  /** Unix timestamp (seconds) the link expires, if set. */
  expire_by: number | null;
  /** Brief description of the Payment Link, if supplied at creation. */
  description?: string | null;
  /** Merchant-provided reference id, if supplied at creation. */
  reference_id?: string | null;
  /** Prefilled customer details. */
  customer?: PaymentLinkCustomerSchema;
  /** Notification channels used. */
  notify?: PaymentLinkNotifySchema;
  /** Arbitrary string key/value metadata. */
  notes?: Record<string, string>;
  /** Whether a partial payment is accepted. */
  accept_partial?: boolean;
  /** Minimum amount accepted for a partial payment. */
  first_min_partial_amount?: number;
  /** URL the customer is redirected to after a successful payment. */
  callback_url?: string | null;
  /** Method used for the callback redirect. */
  callback_method?: string | null;
};

/** A Razorpay Payment Link resource, returned by the Payment Links endpoints. */
export const PaymentLinkSchemaObject: BaseGuardian<PaymentLinkSchema> = Guardian
  .object({
    id: Guardian.string(),
    short_url: Guardian.string(),
    status: Guardian.enum(PAYMENT_LINK_STATUSES),
    amount: Guardian.number().integer(),
    amount_paid: Guardian.number().integer(),
    currency: Guardian.string(),
    created_at: Guardian.number().integer(),
    expire_by: Guardian.number().integer().nullable(),
    description: Guardian.string().nullable().optional(),
    reference_id: Guardian.string().nullable().optional(),
    customer: PaymentLinkCustomerSchemaObject.optional(),
    notify: PaymentLinkNotifySchemaObject.optional(),
    notes: notesResponseGuard.optional(),
    accept_partial: Guardian.boolean().optional(),
    first_min_partial_amount: Guardian.number().integer().optional(),
    callback_url: Guardian.string().nullable().optional(),
    callback_method: Guardian.string().nullable().optional(),
  }).passthrough().describe({
    title: 'Payment Link resource',
    description:
      'A Razorpay Payment Link resource, returned by the Payment Links endpoints.',
  });
