import { type BaseGuardian, Guardian } from '@guardian';
import {
  amountGuard,
  currencyGuard,
  notesGuard,
  notesResponseGuard,
  receiptGuard,
} from './Common.ts';

/** Documented lifecycle states of a Razorpay Order. */
export const ORDER_STATUSES = ['created', 'attempted', 'paid'] as const;

/**
 * Validates a Razorpay Order id (`order_...`), as accepted by
 * {@link Razorpay.getOrder}.
 */
export const orderIdGuard: BaseGuardian<string> = Guardian.string().pattern(
  // Alphanumeric ONLY after the prefix — see paymentIdGuard for why `\S+`
  // was a path-traversal vector.
  /^order_[A-Za-z0-9]+$/,
  "order id must match '^order_[A-Za-z0-9]+$'",
).describe({
  title: 'Order id',
  description: 'A Razorpay Order identifier, e.g. `order_EKwxwAgItmmXdp`.',
});

/**
 * Schema for {@link Razorpay.createOrder} request options
 * (https://razorpay.com/docs/api/orders/create/).
 *
 * Only `amount` and `currency` are required.
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived): JSR's
 * public-API "slow types" check requires the *originating* declaration of
 * any type reachable from the public API to carry an explicit annotation,
 * including a private `const` reached only via `typeof` — so the shape is
 * pinned directly here instead of threaded through an internal helper.
 *
 * @example
 * ```typescript
 * import { CreateOrderRequestSchemaObject } from '@tundraconnect/razorpay/schemas';
 *
 * const [error, options] = CreateOrderRequestSchemaObject.safeParse({
 *   amount: 29900,
 *   currency: 'INR',
 *   receipt: 'receipt#1',
 * });
 * if (!error) {
 *   console.log('Valid request:', options.amount);
 * }
 * ```
 */
export type CreateOrderRequestSchema = {
  /** Amount to charge, in the smallest currency unit (e.g. paise for INR). */
  amount: number;
  /** Uppercase ISO 4217 currency code, e.g. `'INR'`. */
  currency: string;
  /** Merchant-provided receipt id, at most 40 characters. */
  receipt?: string;
  /** Arbitrary string key/value metadata — at most 15 pairs, each value at most 256 characters. */
  notes?: Record<string, string>;
};

/** Options accepted by {@link Razorpay.createOrder}, validated before the API call. */
export const CreateOrderRequestSchemaObject: BaseGuardian<
  CreateOrderRequestSchema
> = Guardian.object({
  amount: amountGuard,
  currency: currencyGuard,
  receipt: receiptGuard.optional(),
  notes: notesGuard.optional(),
}).describe({
  title: 'Create Order request',
  description:
    'Options accepted by Razorpay.createOrder(), validated before the API call.',
});

/**
 * Schema for the Razorpay Order resource
 * (https://razorpay.com/docs/api/orders/create/#response-parameters,
 * https://razorpay.com/docs/api/orders/fetch-with-id/).
 *
 * `.passthrough()` keeps any unmodeled field (e.g. `checkout`, `offers`)
 * reachable at runtime — just untyped — instead of silently dropping it.
 *
 * @example
 * ```typescript
 * import { OrderSchemaObject } from '@tundraconnect/razorpay/schemas';
 *
 * const [error, order] = OrderSchemaObject.safeParse({
 *   id: 'order_EKwxwAgItmmXdp',
 *   entity: 'order',
 *   amount: 29900,
 *   amount_paid: 0,
 *   amount_due: 29900,
 *   currency: 'INR',
 *   receipt: 'receipt#1',
 *   offer_id: null,
 *   status: 'created',
 *   attempts: 0,
 *   notes: {},
 *   created_at: 1582637108,
 * });
 * if (!error) {
 *   console.log('Order status:', order.status);
 * }
 * ```
 */
export type OrderSchema = {
  /** Unique identifier of the order (`order_...`). */
  id: string;
  /** Object type discriminator. */
  entity: 'order';
  /** Order amount, in the smallest currency unit. */
  amount: number;
  /** Amount paid against this order so far. */
  amount_paid: number;
  /** Amount still due on this order. */
  amount_due: number;
  /** Uppercase ISO 4217 currency code. */
  currency: string;
  /** Merchant-provided receipt id, if supplied at creation. */
  receipt: string | null;
  /** id of an offer applied to this order, if any. */
  offer_id: string | null;
  /** Current lifecycle status. */
  status: (typeof ORDER_STATUSES)[number];
  /** Number of payment attempts made against this order. */
  attempts: number;
  /** Arbitrary string key/value metadata. */
  notes: Record<string, string>;
  /** Unix timestamp (seconds) the order was created. */
  created_at: number;
};

/** A Razorpay Order resource, returned by the Orders endpoints. */
export const OrderSchemaObject: BaseGuardian<OrderSchema> = Guardian.object({
  id: Guardian.string(),
  entity: Guardian.literal('order'),
  amount: Guardian.number().integer(),
  amount_paid: Guardian.number().integer(),
  amount_due: Guardian.number().integer(),
  currency: Guardian.string(),
  receipt: Guardian.string().nullable(),
  offer_id: Guardian.string().nullable(),
  status: Guardian.enum(ORDER_STATUSES),
  attempts: Guardian.number().integer(),
  notes: notesResponseGuard,
  created_at: Guardian.number().integer(),
}).passthrough().describe({
  title: 'Order resource',
  description: 'A Razorpay Order resource, returned by the Orders endpoints.',
});
