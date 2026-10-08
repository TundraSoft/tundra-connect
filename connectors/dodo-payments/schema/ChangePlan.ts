import { type BaseGuardian, Guardian } from '@guardian';

/**
 * How Dodo bills the switch when a subscription changes plan:
 *
 * - `prorated_immediately`: credit the unused part of the current cycle,
 *   then charge a full cycle of the new plan.
 * - `full_immediately`: charge the new plan in full, with no credit for
 *   the current cycle.
 * - `difference_immediately`: an upgrade charges the price difference now;
 *   a downgrade keeps the remaining value as credit for later renewals.
 * - `do_not_bill`: switch now with no charge or credit; the billing cycle
 *   is unchanged.
 */
export const PRORATION_BILLING_MODES = [
  'prorated_immediately',
  'full_immediately',
  'difference_immediately',
  'do_not_bill',
] as const;

/** Type definition for {@link ProrationBillingModeSchemaObject}. */
export type ProrationBillingModeSchema = typeof PRORATION_BILLING_MODES[number];

/**
 * Schema for a plan change's proration billing mode.
 *
 * @example
 * ```typescript
 * import { ProrationBillingModeSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, mode] = ProrationBillingModeSchemaObject.safeParse('prorated_immediately');
 * ```
 */
export const ProrationBillingModeSchemaObject: BaseGuardian<
  ProrationBillingModeSchema
> = Guardian.enum(PRORATION_BILLING_MODES).describe({
  title: 'Proration billing mode',
  description: 'How a plan change is billed.',
});

/** When a plan change applies: now (the default) or at the next renewal. */
export const PLAN_CHANGE_EFFECTIVE_AT = [
  'immediately',
  'next_billing_date',
] as const;

/** Type definition for a plan change's `effective_at`. */
export type PlanChangeEffectiveAtSchema =
  typeof PLAN_CHANGE_EFFECTIVE_AT[number];

/**
 * What happens when a plan change's payment fails: `prevent_change` keeps
 * the current plan until payment succeeds; `apply_change` switches anyway.
 * Dodo uses the business-level default when omitted, which is
 * `apply_change` unless the business changed it.
 */
export const PLAN_CHANGE_ON_PAYMENT_FAILURE = [
  'prevent_change',
  'apply_change',
] as const;

/** Type definition for a plan change's `on_payment_failure`. */
export type PlanChangeOnPaymentFailureSchema =
  typeof PLAN_CHANGE_ON_PAYMENT_FAILURE[number];

/** Type definition for {@link ChangePlanRequestSchemaObject}. */
export type ChangePlanRequestSchema = {
  /** The product to move the subscription to. */
  product_id: string;
  /** Units of the new plan, at least 1. */
  quantity: number;
  proration_billing_mode: ProrationBillingModeSchema;
  /** @default 'immediately' */
  effective_at?: PlanChangeEffectiveAtSchema;
  on_payment_failure?: PlanChangeOnPaymentFailureSchema | null;
  /**
   * Charge the change through a hosted checkout page instead of the saved
   * payment method; the link comes back in `payment_link`. Needs the
   * business capability `allow_plan_change_via_payment_link`, an immediate
   * change, and `on_payment_failure: 'prevent_change'`.
   */
  collect_via_payment_link?: boolean;
  /** Replace an already scheduled plan change with this one. */
  cancel_scheduled_change_plan?: boolean;
  /** Addons for the new plan. An empty list removes existing addons. */
  addons?: { addon_id: string; quantity: number }[] | null;
  /**
   * Up to 20 discount codes, applied in order, that REPLACE the
   * subscription's current discounts; `[]` removes them all. Omitted, the
   * discounts created with `preserve_on_plan_change: true` carry over and
   * the rest are dropped.
   *
   * This is Dodo's only route for applying a code to an existing
   * subscription: change plan to the SAME product and quantity with
   * `proration_billing_mode: 'do_not_bill'` (checked in test mode: no
   * charge, and codes already applied keep their remaining cycles). List
   * any codes to keep along with the new one.
   */
  discount_codes?: string[] | null;
  /** Metadata for the change's payment; the subscription's when omitted. */
  metadata?: Record<string, string> | null;
  /** Include adaptive-currency fees in the price instead of adding them. */
  adaptive_currency_fees_inclusive?: boolean | null;
};

/**
 * Schema for `POST /subscriptions/{id}/change-plan`.
 *
 * The rules Dodo places on `collect_via_payment_link` are checked locally,
 * so a request that could never succeed fails before it is sent.
 *
 * @example
 * ```typescript
 * import { ChangePlanRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, body] = ChangePlanRequestSchemaObject.safeParse({
 *   product_id: 'pdt_pro_monthly',
 *   quantity: 1,
 *   proration_billing_mode: 'prorated_immediately',
 * });
 * ```
 */
export const ChangePlanRequestSchemaObject: BaseGuardian<
  ChangePlanRequestSchema
> = Guardian.object({
  product_id: Guardian.string().notEmpty('`product_id` is required'),
  quantity: Guardian.number().strict().integer().min(
    1,
    '`quantity` must be at least 1',
  ),
  proration_billing_mode: ProrationBillingModeSchemaObject,
  effective_at: Guardian.enum(PLAN_CHANGE_EFFECTIVE_AT).optional(),
  on_payment_failure: Guardian.enum(PLAN_CHANGE_ON_PAYMENT_FAILURE).nullable()
    .optional(),
  collect_via_payment_link: Guardian.boolean().strict().optional(),
  cancel_scheduled_change_plan: Guardian.boolean().strict().optional(),
  addons: Guardian.array(
    Guardian.object({
      addon_id: Guardian.string().notEmpty(),
      quantity: Guardian.number().strict().integer().min(0),
    }).strict(),
  ).nullable().optional(),
  discount_codes: Guardian.array(Guardian.string()).maxLength(20).nullable()
    .optional(),
  metadata: Guardian.record(Guardian.string()).nullable().optional(),
  adaptive_currency_fees_inclusive: Guardian.boolean().strict().nullable()
    .optional(),
}).strict().refine(
  (req) =>
    !req.collect_via_payment_link ||
    ((req.effective_at ?? 'immediately') === 'immediately' &&
      req.on_payment_failure === 'prevent_change'),
  "`collect_via_payment_link` needs an immediate change and `on_payment_failure: 'prevent_change'`",
).describe({
  title: 'Change plan request',
  description: 'Body for POST /subscriptions/{id}/change-plan.',
}) as unknown as BaseGuardian<ChangePlanRequestSchema>;

/** Type definition for {@link ChangePlanResponseSchemaObject}. */
export type ChangePlanResponseSchema = {
  /** Checkout URL, present when the change is collected by payment link. */
  payment_link?: string | null;
  /** The payment that settles the change, when one was created. */
  payment_id?: string | null;
  /** Secret for an embedded checkout. Never log it. */
  client_secret?: string | null;
  /** When `payment_link` stops working. */
  expires_on?: string | null;
};

/**
 * Schema for the change-plan response. All four fields are null for a
 * change charged to the saved payment method, and are filled in only for
 * `collect_via_payment_link`. An empty body parses as an empty object.
 *
 * @example
 * ```typescript
 * import { ChangePlanResponseSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, result] = ChangePlanResponseSchemaObject.safeParse({
 *   payment_id: 'pay_1',
 * });
 * ```
 */
export const ChangePlanResponseSchemaObject: BaseGuardian<
  ChangePlanResponseSchema
> = Guardian.preprocess(
  (
    raw: unknown,
  ) => (raw === null || raw === undefined || raw === '' ? {} : raw),
  Guardian.object({
    payment_link: Guardian.string().nullable().optional(),
    payment_id: Guardian.string().nullable().optional(),
    client_secret: Guardian.string().nullable().optional(),
    expires_on: Guardian.string().nullable().optional(),
  }).passthrough().describe({
    title: 'Change plan response',
    description: 'Result of POST /subscriptions/{id}/change-plan.',
  }),
);
