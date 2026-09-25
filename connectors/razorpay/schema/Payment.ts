import { type BaseGuardian, Guardian } from '@guardian';
import { currencyGuard, notesResponseGuard } from './Common.ts';

/** Documented lifecycle states of a Razorpay Payment. */
export const PAYMENT_STATUSES = [
  'created',
  'authorized',
  'captured',
  'refunded',
  'failed',
] as const;

/**
 * Validates a Razorpay Payment id (`pay_...`), as accepted by
 * {@link Razorpay.getPayment} / {@link Razorpay.capturePayment}.
 */
export const paymentIdGuard: BaseGuardian<string> = Guardian.string().pattern(
  // Alphanumeric ONLY after the prefix. The previous `\S+` admitted `/`,
  // `.` and `?`, so an id like `pay_../../../orders` passed validation and
  // escaped its path segment into a different authenticated endpoint.
  /^pay_[A-Za-z0-9]+$/,
  "payment id must match '^pay_[A-Za-z0-9]+$'",
).describe({
  title: 'Payment id',
  description: 'A Razorpay Payment identifier, e.g. `pay_29QQoUBi66xm2f`.',
});

/**
 * Schema for {@link Razorpay.capturePayment} request options
 * (https://razorpay.com/docs/api/payments/capture/).
 *
 * Both fields are required — Razorpay rejects a capture whose `amount`
 * doesn't equal the payment's authorized amount, and whose `currency`
 * doesn't match the original payment's currency.
 */
export type CapturePaymentRequestSchema = {
  /** Amount to capture, in the smallest currency unit — must equal the authorized amount. */
  amount: number;
  /** Uppercase ISO 4217 currency code — must match the payment's original currency. */
  currency: string;
};

/** Options accepted by {@link Razorpay.capturePayment}, validated before the API call. */
export const CapturePaymentRequestSchemaObject: BaseGuardian<
  CapturePaymentRequestSchema
> = Guardian.object({
  amount: Guardian.number().integer().positive(),
  currency: currencyGuard,
}).describe({
  title: 'Capture Payment request',
  description:
    'Options accepted by Razorpay.capturePayment(), validated before the API call.',
});

/**
 * Schema for the Razorpay Payment resource
 * (https://razorpay.com/docs/api/payments/fetch-with-id/).
 *
 * Models the commonly-present fields rather than every documented field —
 * `.passthrough()` keeps any unmodeled field (e.g. `acquirer_data`, `upi`,
 * `card`) reachable at runtime, just untyped. Exactly one of
 * `card_id`/`bank`/`wallet`/`vpa` is ever populated at a time, depending on
 * `method`, so all four are modeled as nullable/optional rather than
 * required.
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived): JSR's
 * public-API "slow types" check requires the *originating* declaration of
 * any type reachable from the public API to carry an explicit annotation.
 *
 * @example
 * ```typescript
 * import { PaymentSchemaObject } from '@tundraconnect/razorpay/schemas';
 *
 * const [error, payment] = PaymentSchemaObject.safeParse({
 *   id: 'pay_29QQoUBi66xm2f',
 *   entity: 'payment',
 *   amount: 29900,
 *   currency: 'INR',
 *   status: 'captured',
 *   order_id: 'order_EKwxwAgItmmXdp',
 *   invoice_id: null,
 *   international: false,
 *   method: 'card',
 *   amount_refunded: 0,
 *   refund_status: null,
 *   captured: true,
 *   description: 'Order #1',
 *   email: 'gaurav.kumar@example.com',
 *   contact: '+919876543210',
 *   notes: {},
 *   fee: 590,
 *   tax: 90,
 *   error_code: null,
 *   error_description: null,
 *   error_source: null,
 *   error_step: null,
 *   error_reason: null,
 *   created_at: 1582637108,
 * });
 * if (!error) {
 *   console.log('Payment status:', payment.status);
 * }
 * ```
 */
export type PaymentSchema = {
  /** Unique identifier of the payment (`pay_...`). */
  id: string;
  /** Object type discriminator. */
  entity: 'payment';
  /** Payment amount, in the smallest currency unit. */
  amount: number;
  /** Uppercase ISO 4217 currency code. */
  currency: string;
  /** Current lifecycle status. */
  status: (typeof PAYMENT_STATUSES)[number];
  /** Order this payment belongs to, if any. */
  order_id: string | null;
  /** Invoice this payment belongs to, if any. */
  invoice_id: string | null;
  /** Whether the payment was made from a non-domestic card/bank. */
  international: boolean;
  /** Payment method used (`card`, `netbanking`, `wallet`, `upi`, `emi`, ...). */
  method: string;
  /** Amount refunded against this payment so far. */
  amount_refunded: number;
  /** Refund status, when applicable. */
  refund_status: string | null;
  /** Whether the payment has been captured. */
  captured: boolean;
  /** Merchant-provided description, if supplied at creation. */
  description: string | null;
  /** Customer's email address. */
  email: string;
  /** Customer's contact number. */
  contact: string;
  /** Arbitrary string key/value metadata. */
  notes: Record<string, string>;
  /** Fee charged by Razorpay for this payment. */
  fee: number | null;
  /** Tax charged on the fee. */
  tax: number | null;
  /** Vendor error code, populated only for a failed payment. */
  error_code: string | null;
  /** Vendor error description, populated only for a failed payment. */
  error_description: string | null;
  /** Origin of the failure (`business`/`customer`/`internal`), when applicable. */
  error_source: string | null;
  /** Processing step at which the failure occurred, when applicable. */
  error_step: string | null;
  /** Vendor-documented reason code for the failure, when applicable. */
  error_reason: string | null;
  /** Unix timestamp (seconds) the payment was created. */
  created_at: number;
  /** id of the underlying card used, when `method` is `card`. */
  card_id?: string | null;
  /** Bank code used, when `method` is `netbanking`/`emandate`. */
  bank?: string | null;
  /** Wallet name used, when `method` is `wallet`. */
  wallet?: string | null;
  /** UPI VPA used, when `method` is `upi`. */
  vpa?: string | null;
  /** Customer this payment belongs to, if any. */
  customer_id?: string | null;
};

/** A Razorpay Payment resource, returned by the Payments endpoints. */
export const PaymentSchemaObject: BaseGuardian<PaymentSchema> = Guardian
  .object({
    id: Guardian.string(),
    entity: Guardian.literal('payment'),
    amount: Guardian.number().integer(),
    currency: Guardian.string(),
    status: Guardian.enum(PAYMENT_STATUSES),
    order_id: Guardian.string().nullable(),
    invoice_id: Guardian.string().nullable(),
    international: Guardian.boolean(),
    method: Guardian.string(),
    amount_refunded: Guardian.number().integer(),
    refund_status: Guardian.string().nullable(),
    captured: Guardian.boolean(),
    description: Guardian.string().nullable(),
    email: Guardian.string(),
    contact: Guardian.string(),
    notes: notesResponseGuard,
    fee: Guardian.number().integer().nullable(),
    tax: Guardian.number().integer().nullable(),
    error_code: Guardian.string().nullable(),
    error_description: Guardian.string().nullable(),
    error_source: Guardian.string().nullable(),
    error_step: Guardian.string().nullable(),
    error_reason: Guardian.string().nullable(),
    created_at: Guardian.number().integer(),
    card_id: Guardian.string().nullable().optional(),
    bank: Guardian.string().nullable().optional(),
    wallet: Guardian.string().nullable().optional(),
    vpa: Guardian.string().nullable().optional(),
    customer_id: Guardian.string().nullable().optional(),
  }).passthrough().describe({
    title: 'Payment resource',
    description:
      'A Razorpay Payment resource, returned by the Payments endpoints.',
  });
