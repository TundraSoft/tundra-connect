import { type BaseGuardian, Guardian } from '@guardian';
import {
  BillingAddressSchemaObject,
  CustomerDetailsSchemaObject,
  SubscriptionStatusSchemaObject,
} from './Common.ts';

/** Recurrence units Dodo bills on. */
export const TIME_INTERVALS = ['Day', 'Week', 'Month', 'Year'] as const;

/** Type definition for {@link TimeIntervalSchemaObject}. */
export type TimeIntervalSchema = typeof TIME_INTERVALS[number];

/**
 * Schema for a billing recurrence unit.
 *
 * @example
 * ```typescript
 * import { TimeIntervalSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, interval] = TimeIntervalSchemaObject.safeParse('Month');
 * ```
 */
export const TimeIntervalSchemaObject: BaseGuardian<TimeIntervalSchema> =
  Guardian.enum(TIME_INTERVALS).describe({
    title: 'Time interval',
    description: 'Recurrence unit for a subscription billing period.',
  });

/**
 * Type definition for {@link SubscriptionDiscountSchemaObject}: one
 * discount applied to a subscription.
 *
 * The two subscription routes carry different shapes. `getSubscription`
 * (and the cancel, pause and resume results) returns the full discount
 * plus `position` and `cycles_remaining`. `listSubscriptions` returns only
 * `discount_id` and `discount_cycles_remaining`, in stack order.
 */
export type SubscriptionDiscountSchema = {
  discount_id: string;
  /**
   * Billing cycles the discount still applies for, counting the current
   * one; `null` for a discount without a cycle limit (seen in test mode).
   * Set on a single-subscription read.
   */
  cycles_remaining?: number | null;
  /** The same count, under the name the list route uses. */
  discount_cycles_remaining?: number | null;
  /** Place in the stack, 0-based. Single-subscription read only. */
  position?: number;
  code?: string;
  /** `percentage` or `flat`. */
  type?: string;
  /** Basis points for `percentage`. */
  amount?: number;
  /** The cycle count the code was created with. */
  subscription_cycles?: number | null;
  /** When the CODE stops being redeemable, not when this subscription's discount ends. */
  expires_at?: string | null;
  name?: string | null;
  preserve_on_plan_change?: boolean;
};

/**
 * Schema for one discount applied to a subscription. Every field but
 * `discount_id` is optional, so the same schema reads both the full shape
 * from `getSubscription` and the short one from `listSubscriptions`.
 * Unknown fields pass through.
 *
 * @example
 * ```typescript
 * import { SubscriptionDiscountSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, applied] = SubscriptionDiscountSchemaObject.safeParse({
 *   discount_id: 'dsc_1',
 *   position: 0,
 *   code: 'WELCOME20',
 *   cycles_remaining: 2,
 * });
 * ```
 */
export const SubscriptionDiscountSchemaObject: BaseGuardian<
  SubscriptionDiscountSchema
> = Guardian.object({
  discount_id: Guardian.string(),
  cycles_remaining: Guardian.number().nullable().optional(),
  discount_cycles_remaining: Guardian.number().nullable().optional(),
  position: Guardian.number().optional(),
  code: Guardian.string().optional(),
  type: Guardian.string().optional(),
  amount: Guardian.number().optional(),
  subscription_cycles: Guardian.number().nullable().optional(),
  expires_at: Guardian.string().nullable().optional(),
  name: Guardian.string().nullable().optional(),
  preserve_on_plan_change: Guardian.boolean().optional(),
}).passthrough().describe({
  title: 'Subscription discount',
  description: 'A discount applied to a subscription.',
});

/** Type definition for {@link SubscriptionSchemaObject}. */
export type SubscriptionSchema = {
  subscription_id: string;
  product_id: string;
  status: import('./Common.ts').SubscriptionStatusSchema;
  customer: import('./Common.ts').CustomerDetailsSchema;
  billing: import('./Common.ts').BillingAddressSchema;
  quantity: number;
  /** Recurring charge before tax, in the currency's smallest unit. */
  recurring_pre_tax_amount: number;
  currency: string;
  created_at: string;
  next_billing_date: string;
  previous_billing_date: string;
  payment_frequency_count: number;
  payment_frequency_interval: TimeIntervalSchema;
  subscription_period_count: number;
  subscription_period_interval: TimeIntervalSchema;
  trial_period_days: number;
  tax_inclusive: boolean;
  on_demand: boolean;
  /**
   * `true` when the subscription is set to stop at the end of the current
   * period rather than immediately — the "cancel at period end" case, in
   * which `status` is STILL `active` until that date passes.
   */
  cancel_at_next_billing_date: boolean;
  metadata: Record<string, string>;
  cancelled_at?: string | null;
  cancellation_comment?: string | null;
  expires_at?: string | null;
  paused_at?: string | null;
  payment_method_id?: string | null;
  /** @deprecated Dodo's own deprecation: the first entry of `discounts`. */
  discount_id?: string | null;
  /** @deprecated Dodo's own deprecation: the first discount's cycles remaining. */
  discount_cycles_remaining?: number | null;
  /** Every discount applied, in stack order. See {@link SubscriptionDiscountSchema}. */
  discounts?: SubscriptionDiscountSchema[] | null;
  tax_id?: string | null;
  trial_amount?: number | null;
};

/**
 * Schema for a subscription record.
 *
 * Unknown fields pass through — Dodo hangs addons, meters, credit
 * entitlements and scheduled plan changes off this object, all outside
 * this connect's scope and all liable to grow.
 *
 * Note `cancel_at_next_billing_date` is independent of `status`: a
 * subscription cancelled at period end stays `active` until that date, so
 * reading `status` alone will tell you it is still running.
 *
 * @example
 * ```typescript
 * import { SubscriptionSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, sub] = SubscriptionSchemaObject.safeParse({
 *   subscription_id: 'sub_1',
 *   product_id: 'prd_1',
 *   status: 'active',
 *   customer: { customer_id: 'cus_1', email: 'a@example.com', name: 'Ada' },
 *   billing: { country: 'US' },
 *   quantity: 1,
 *   recurring_pre_tax_amount: 1000,
 *   currency: 'USD',
 *   created_at: '2026-01-01T00:00:00Z',
 *   next_billing_date: '2026-02-01T00:00:00Z',
 *   previous_billing_date: '2026-01-01T00:00:00Z',
 *   payment_frequency_count: 1,
 *   payment_frequency_interval: 'Month',
 *   subscription_period_count: 1,
 *   subscription_period_interval: 'Month',
 *   trial_period_days: 0,
 *   tax_inclusive: false,
 *   on_demand: false,
 *   cancel_at_next_billing_date: false,
 *   metadata: {},
 * });
 * ```
 */
export const SubscriptionSchemaObject: BaseGuardian<SubscriptionSchema> =
  Guardian.object({
    subscription_id: Guardian.string(),
    product_id: Guardian.string(),
    status: SubscriptionStatusSchemaObject,
    customer: CustomerDetailsSchemaObject,
    billing: BillingAddressSchemaObject,
    quantity: Guardian.number(),
    recurring_pre_tax_amount: Guardian.number(),
    currency: Guardian.string(),
    created_at: Guardian.string(),
    next_billing_date: Guardian.string(),
    previous_billing_date: Guardian.string(),
    payment_frequency_count: Guardian.number(),
    payment_frequency_interval: TimeIntervalSchemaObject,
    subscription_period_count: Guardian.number(),
    subscription_period_interval: TimeIntervalSchemaObject,
    trial_period_days: Guardian.number(),
    tax_inclusive: Guardian.boolean(),
    on_demand: Guardian.boolean(),
    cancel_at_next_billing_date: Guardian.boolean(),
    metadata: Guardian.record(Guardian.string()),
    cancelled_at: Guardian.string().nullable().optional(),
    cancellation_comment: Guardian.string().nullable().optional(),
    expires_at: Guardian.string().nullable().optional(),
    paused_at: Guardian.string().nullable().optional(),
    payment_method_id: Guardian.string().nullable().optional(),
    discount_id: Guardian.string().nullable().optional(),
    discount_cycles_remaining: Guardian.number().nullable().optional(),
    discounts: Guardian.array(SubscriptionDiscountSchemaObject).nullable()
      .optional(),
    tax_id: Guardian.string().nullable().optional(),
    trial_amount: Guardian.number().nullable().optional(),
  }).passthrough().describe({
    title: 'Subscription',
    description: 'A subscription record.',
  });

/** Type definition for {@link SubscriptionListSchemaObject}. */
export type SubscriptionListSchema = {
  items: SubscriptionSchema[];
};

/**
 * Schema for a page of subscriptions. An absent `items` normalizes to an
 * empty array — "this customer has no subscriptions" is an answer, not a
 * failure.
 *
 * @example
 * ```typescript
 * import { SubscriptionListSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, page] = SubscriptionListSchemaObject.safeParse({ items: [] });
 * ```
 */
export const SubscriptionListSchemaObject: BaseGuardian<
  SubscriptionListSchema
> = Guardian.preprocess(
  (raw: unknown) => {
    // A bare array is treated as the items themselves rather than being
    // spread into an empty page — silently returning `[]` for a body that
    // actually carried results is the worst available outcome.
    if (Array.isArray(raw)) return { items: raw };
    if (typeof raw !== 'object' || raw === null) return raw;
    const obj = raw as Record<string, unknown>;
    return { ...obj, items: obj.items ?? [] };
  },
  Guardian.object({
    items: Guardian.array(SubscriptionSchemaObject),
  }).passthrough().describe({
    title: 'Subscription list page',
    description: 'One page of GET /subscriptions results.',
  }),
);
