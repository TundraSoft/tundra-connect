import { type BaseGuardian, Guardian } from '@guardian';
import {
  type ProductMetadataSchema,
  ProductMetadataSchemaObject,
} from './Product.ts';

/**
 * The discount types Dodo lets you create. `percentage` takes `amount` in
 * basis points; `flat` deducts a money amount set per currency in
 * `currency_options`. Dodo's third type, `flat_per_unit`, is blocked for
 * new discounts.
 */
export const DISCOUNT_TYPES = ['percentage', 'flat'] as const;

/** Type definition for {@link DiscountTypeSchemaObject}. */
export type DiscountTypeSchema = typeof DISCOUNT_TYPES[number];

/**
 * Schema for the type of a discount being created or updated.
 *
 * @example
 * ```typescript
 * import { DiscountTypeSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, type] = DiscountTypeSchemaObject.safeParse('percentage');
 * ```
 */
export const DiscountTypeSchemaObject: BaseGuardian<DiscountTypeSchema> =
  Guardian.enum(DISCOUNT_TYPES).describe({
    title: 'Discount type',
    description: 'percentage (basis points) or flat (per-currency amount).',
  });

/**
 * Who may redeem a discount code:
 *
 * - `any`: every customer. Dodo's default.
 * - `first_time`: customers who have not bought from you before.
 * - `existing`: customers who have bought from you before.
 * - `specific`: only customers on the code's allow list. A new `specific`
 *   code has an empty list and rejects every redemption until customers
 *   are added with `addDiscountCustomers`.
 */
export const DISCOUNT_CUSTOMER_ELIGIBILITIES = [
  'any',
  'first_time',
  'existing',
  'specific',
] as const;

/** Type definition for {@link DiscountCustomerEligibilitySchemaObject}. */
export type DiscountCustomerEligibilitySchema =
  typeof DISCOUNT_CUSTOMER_ELIGIBILITIES[number];

/**
 * Schema for a discount's customer eligibility.
 *
 * @example
 * ```typescript
 * import { DiscountCustomerEligibilitySchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, eligibility] = DiscountCustomerEligibilitySchemaObject.safeParse('first_time');
 * ```
 */
export const DiscountCustomerEligibilitySchemaObject: BaseGuardian<
  DiscountCustomerEligibilitySchema
> = Guardian.enum(DISCOUNT_CUSTOMER_ELIGIBILITIES).describe({
  title: 'Discount customer eligibility',
  description: 'Who may redeem the code: any, first_time, existing, specific.',
});

/** Type definition for {@link DiscountCurrencyOptionRequestSchemaObject}. */
export type DiscountCurrencyOptionRequestSchema = {
  /** ISO 4217 code, uppercase, e.g. `USD`. One entry per currency. */
  currency: string;
  /**
   * The currency used when the checkout currency has no entry of its own.
   * At most one entry may be the default.
   */
  is_default?: boolean;
  /**
   * In minor units. For a `flat` code this IS the deduction in this
   * currency; for a `percentage` code it caps the discount. Greater than
   * zero when set.
   */
  max_amount_possible?: number | null;
  /** Smallest cart subtotal the code applies to, in minor units. `0` means no minimum. */
  minimum_subtotal?: number;
};

/**
 * Schema for one `currency_options` entry of a discount request.
 *
 * @example
 * ```typescript
 * import { DiscountCurrencyOptionRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * // A flat $5.00 off, on orders of $20.00 or more.
 * const [error, option] = DiscountCurrencyOptionRequestSchemaObject.safeParse({
 *   currency: 'USD',
 *   is_default: true,
 *   max_amount_possible: 500,
 *   minimum_subtotal: 2000,
 * });
 * ```
 */
export const DiscountCurrencyOptionRequestSchemaObject: BaseGuardian<
  DiscountCurrencyOptionRequestSchema
> = Guardian.object({
  currency: Guardian.string().pattern(
    /^[A-Z]{3}$/,
    '`currency` must be an uppercase ISO 4217 code, e.g. USD',
  ),
  is_default: Guardian.boolean().strict().optional(),
  max_amount_possible: Guardian.number().strict().integer().min(
    1,
    '`max_amount_possible` must be a positive amount in minor units',
  ).nullable().optional(),
  minimum_subtotal: Guardian.number().strict().integer().min(
    0,
    '`minimum_subtotal` must be a non-negative amount in minor units',
  ).optional(),
}).strict().describe({
  title: 'Discount currency option',
  description:
    'Per-currency deduction (flat) or cap (percentage), and minimum.',
});

/** Type definition for {@link CreateDiscountRequestSchemaObject}. */
export type CreateDiscountRequestSchema = {
  type: DiscountTypeSchema;
  /**
   * For `percentage`, basis points from 1 to 10000: `1500` is 15%. For
   * `flat`, Dodo requires an amount of at least 1 and stores it, but the
   * deduction is each currency's `max_amount_possible` (checked in test
   * mode: `amount: 1` with a deduction of 250 took 250 off). Set it to the
   * default currency's deduction so the record reads sensibly.
   */
  amount: number;
  /**
   * Required for `flat`: at least one entry, each with
   * `max_amount_possible`. Optional per-currency caps for `percentage`.
   * One entry per currency, at most one default; a lone entry becomes the
   * default.
   */
  currency_options?: DiscountCurrencyOptionRequestSchema[] | null;
  /**
   * 3 to 16 characters. Dodo upper-cases it, and generates a random
   * 16-character code when omitted.
   */
  code?: string | null;
  name?: string | null;
  /** Total redemptions allowed, at least 1. Unlimited when omitted. */
  usage_limit?: number | null;
  /** Redemptions allowed per customer; at most `usage_limit` when both are set. */
  per_customer_usage_limit?: number | null;
  /**
   * Billing cycles a subscription keeps the discount for: `1` is the
   * first payment only. Omitted or null applies it indefinitely.
   */
  subscription_cycles?: number | null;
  /** Product ids the code is limited to. Any product when omitted. */
  restricted_to?: string[] | null;
  /** RFC 3339 date-time the code becomes valid; immediately when omitted. */
  starts_at?: string | null;
  /** RFC 3339 date-time the code stops working; after `starts_at`. */
  expires_at?: string | null;
  /** @default 'any' */
  customer_eligibility?: DiscountCustomerEligibilitySchema | null;
  /** Keep the discount when the subscription changes plan. @default false */
  preserve_on_plan_change?: boolean;
  metadata?: ProductMetadataSchema;
};

/**
 * Type definition for {@link UpdateDiscountRequestSchemaObject}. Every
 * field is optional and an omitted field is left as it is.
 */
export type UpdateDiscountRequestSchema = {
  type?: DiscountTypeSchema;
  /** Basis points for `percentage`; see {@link CreateDiscountRequestSchema.amount}. */
  amount?: number;
  /**
   * REPLACES every currency option; `[]` removes them all. Each entry of a
   * `flat` code needs `max_amount_possible`, which Dodo checks against the
   * stored type.
   */
  currency_options?: DiscountCurrencyOptionRequestSchema[];
  /** A new code, 3 to 16 characters. */
  code?: string;
  /** Dodo does not document whether `null` clears it or leaves it. */
  name?: string | null;
  /** Dodo does not document whether `null` clears it; it may not go below `times_used`. */
  usage_limit?: number | null;
  /** `null` clears it back to unlimited. */
  per_customer_usage_limit?: number | null;
  /** Dodo does not document whether `null` clears it or leaves it. */
  subscription_cycles?: number | null;
  /** REPLACES the product restriction; `[]` removes it. */
  restricted_to?: string[];
  /** `null` clears it, making the code valid immediately. */
  starts_at?: string | null;
  /** Dodo does not document whether `null` clears it or leaves it. */
  expires_at?: string | null;
  /** Can be changed but never cleared. */
  customer_eligibility?: DiscountCustomerEligibilitySchema;
  preserve_on_plan_change?: boolean;
  metadata?: ProductMetadataSchema;
};

/**
 * RFC 3339 date-time with an explicit offset, the form Dodo parses. A bare
 * date or an offset-less time would be rejected there with a 422.
 */
const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const dateTime = (field: string) =>
  Guardian.string().pattern(
    RFC3339,
    `\`${field}\` must be an RFC 3339 date-time with an offset, e.g. 2026-01-01T00:00:00Z`,
  ).refine(
    (value) => !Number.isNaN(Date.parse(value)),
    `\`${field}\` is not a real date`,
  );

const positiveCount = (field: string) =>
  Guardian.number().strict().integer().min(
    1,
    `\`${field}\` must be at least 1`,
  );

const discountCode = () =>
  Guardian.string().minLength(3, '`code` must be at least 3 characters')
    .maxLength(16, '`code` must be at most 16 characters');

const currencyOptions = () =>
  Guardian.array(DiscountCurrencyOptionRequestSchemaObject).refine(
    (options) =>
      new Set(options.map((option) => option.currency)).size ===
        options.length,
    '`currency_options` may list each currency only once',
  ).refine(
    (options) => options.filter((option) => option.is_default).length <= 1,
    'only one `currency_options` entry may be the default',
  );

const productIds = () =>
  Guardian.array(
    Guardian.string().notEmpty('`restricted_to` entries must be product ids'),
  );

/** Shared cross-field rules, applied to a create or an update alike. */
type DiscountRuleInput = {
  type?: DiscountTypeSchema;
  amount?: number;
  usage_limit?: number | null;
  per_customer_usage_limit?: number | null;
  starts_at?: string | null;
  expires_at?: string | null;
};

const percentageInRange = (d: DiscountRuleInput) =>
  d.type !== 'percentage' || d.amount === undefined || d.amount <= 10_000;
const PERCENTAGE_MESSAGE =
  'a `percentage` amount is in basis points and must be at most 10000 (100%)';

const perCustomerWithinTotal = (d: DiscountRuleInput) =>
  typeof d.usage_limit !== 'number' ||
  typeof d.per_customer_usage_limit !== 'number' ||
  d.per_customer_usage_limit <= d.usage_limit;
const PER_CUSTOMER_MESSAGE =
  '`per_customer_usage_limit` must not exceed `usage_limit`';

const expiresAfterStart = (d: DiscountRuleInput) =>
  typeof d.starts_at !== 'string' || typeof d.expires_at !== 'string' ||
  Date.parse(d.expires_at) > Date.parse(d.starts_at);
const WINDOW_MESSAGE = '`expires_at` must be after `starts_at`';

/**
 * Schema for `POST /discounts`.
 *
 * Unknown fields are REJECTED rather than dropped: a misspelt
 * `usageLimit` silently dropped would create a code with no limit at all.
 * The rules Dodo documents are checked locally, so a code that could
 * never be created fails before it is sent:
 *
 * - a `percentage` amount is at most 10000 basis points;
 * - a `flat` code has at least one currency option, each with a
 *   `max_amount_possible`;
 * - each currency appears once, with at most one default;
 * - `per_customer_usage_limit` is at most `usage_limit`;
 * - `expires_at` is after `starts_at`.
 *
 * @example
 * ```typescript
 * import { CreateDiscountRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * // 20% off the first payment, once per customer, new customers only.
 * const [error, body] = CreateDiscountRequestSchemaObject.safeParse({
 *   type: 'percentage',
 *   amount: 2000,
 *   code: 'WELCOME20',
 *   subscription_cycles: 1,
 *   per_customer_usage_limit: 1,
 *   customer_eligibility: 'first_time',
 *   metadata: { partner_id: 'acme' },
 * });
 * ```
 */
export const CreateDiscountRequestSchemaObject: BaseGuardian<
  CreateDiscountRequestSchema
> = Guardian.object({
  type: DiscountTypeSchemaObject,
  amount: positiveCount('amount'),
  currency_options: currencyOptions().nullable().optional(),
  code: discountCode().nullable().optional(),
  name: Guardian.string().nullable().optional(),
  usage_limit: positiveCount('usage_limit').nullable().optional(),
  per_customer_usage_limit: positiveCount('per_customer_usage_limit')
    .nullable().optional(),
  subscription_cycles: positiveCount('subscription_cycles').nullable()
    .optional(),
  restricted_to: productIds().nullable().optional(),
  starts_at: dateTime('starts_at').nullable().optional(),
  expires_at: dateTime('expires_at').nullable().optional(),
  customer_eligibility: DiscountCustomerEligibilitySchemaObject.nullable()
    .optional(),
  preserve_on_plan_change: Guardian.boolean().strict().optional(),
  metadata: ProductMetadataSchemaObject.optional(),
}).strict()
  .refine(percentageInRange, PERCENTAGE_MESSAGE)
  .refine(
    (d) =>
      d.type !== 'flat' ||
      ((d.currency_options?.length ?? 0) > 0 &&
        d.currency_options!.every((o) =>
          typeof o.max_amount_possible === 'number'
        )),
    'a `flat` discount needs `currency_options`, each with `max_amount_possible`: that is the deduction',
  )
  .refine(perCustomerWithinTotal, PER_CUSTOMER_MESSAGE)
  .refine(expiresAfterStart, WINDOW_MESSAGE)
  .describe({
    title: 'Create discount request',
    description: 'Body for POST /discounts.',
  }) as unknown as BaseGuardian<CreateDiscountRequestSchema>;

/**
 * Schema for `PATCH /discounts/{discount_id}`, a partial update. An empty
 * update is rejected locally, and unknown fields are rejected as for
 * {@link CreateDiscountRequestSchemaObject}. Cross-field rules are checked
 * between the fields the update itself carries; Dodo checks them against
 * the stored discount too.
 *
 * @example
 * ```typescript
 * import { UpdateDiscountRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, body] = UpdateDiscountRequestSchemaObject.safeParse({
 *   expires_at: '2026-12-31T23:59:59Z',
 *   usage_limit: 500,
 * });
 * ```
 */
export const UpdateDiscountRequestSchemaObject: BaseGuardian<
  UpdateDiscountRequestSchema
> = Guardian.object({
  type: DiscountTypeSchemaObject.optional(),
  amount: positiveCount('amount').optional(),
  currency_options: currencyOptions().optional(),
  code: discountCode().optional(),
  name: Guardian.string().nullable().optional(),
  usage_limit: positiveCount('usage_limit').nullable().optional(),
  per_customer_usage_limit: positiveCount('per_customer_usage_limit')
    .nullable().optional(),
  subscription_cycles: positiveCount('subscription_cycles').nullable()
    .optional(),
  restricted_to: productIds().optional(),
  starts_at: dateTime('starts_at').nullable().optional(),
  expires_at: dateTime('expires_at').nullable().optional(),
  customer_eligibility: DiscountCustomerEligibilitySchemaObject.optional(),
  preserve_on_plan_change: Guardian.boolean().strict().optional(),
  metadata: ProductMetadataSchemaObject.optional(),
}).strict()
  .refine(
    (update) => Object.values(update).some((value) => value !== undefined),
    'an update must change at least one field',
  )
  .refine(percentageInRange, PERCENTAGE_MESSAGE)
  .refine(perCustomerWithinTotal, PER_CUSTOMER_MESSAGE)
  .refine(expiresAfterStart, WINDOW_MESSAGE)
  .describe({
    title: 'Update discount request',
    description: 'Body for PATCH /discounts/{discount_id}.',
  }) as unknown as BaseGuardian<UpdateDiscountRequestSchema>;

/** Type definition for {@link DiscountCurrencyOptionSchemaObject}. */
export type DiscountCurrencyOptionSchema = {
  currency: string;
  is_default: boolean;
  /** Minor units; `0` means no minimum. */
  minimum_subtotal: number;
  /** The deduction (`flat`) or the cap (`percentage`), in minor units. */
  max_amount_possible?: number | null;
};

/**
 * Schema for one `currency_options` entry of a discount record.
 *
 * @example
 * ```typescript
 * import { DiscountCurrencyOptionSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, option] = DiscountCurrencyOptionSchemaObject.safeParse({
 *   currency: 'USD',
 *   is_default: true,
 *   minimum_subtotal: 0,
 *   max_amount_possible: 500,
 * });
 * ```
 */
export const DiscountCurrencyOptionSchemaObject: BaseGuardian<
  DiscountCurrencyOptionSchema
> = Guardian.object({
  currency: Guardian.string(),
  is_default: Guardian.boolean(),
  minimum_subtotal: Guardian.number(),
  max_amount_possible: Guardian.number().nullable().optional(),
}).passthrough().describe({
  title: 'Discount currency option',
  description: 'A per-currency option on a discount record.',
});

/** Type definition for {@link DiscountSchemaObject}. */
export type DiscountSchema = {
  discount_id: string;
  business_id: string;
  /**
   * One of {@link DISCOUNT_TYPES}, typed as a string so a discount of
   * Dodo's blocked `flat_per_unit` type still reads.
   */
  type: string;
  /** Upper-case. */
  code: string;
  /** Basis points for `percentage`. */
  amount: number;
  times_used: number;
  /** Product ids; empty when the code applies to any product. */
  restricted_to: string[];
  created_at: string;
  /** One of {@link DISCOUNT_CUSTOMER_ELIGIBILITIES}, typed as a string so a new value never fails a read. */
  customer_eligibility: string;
  preserve_on_plan_change: boolean;
  metadata: ProductMetadataSchema;
  currency_options?: DiscountCurrencyOptionSchema[] | null;
  name?: string | null;
  usage_limit?: number | null;
  per_customer_usage_limit?: number | null;
  subscription_cycles?: number | null;
  starts_at?: string | null;
  expires_at?: string | null;
};

/**
 * Schema for a discount record, from every discount route that returns
 * one. Unknown fields pass through.
 *
 * @example
 * ```typescript
 * import { DiscountSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, discount] = DiscountSchemaObject.safeParse({
 *   discount_id: 'dsc_1',
 *   business_id: 'biz_1',
 *   type: 'percentage',
 *   code: 'WELCOME20',
 *   amount: 2000,
 *   times_used: 0,
 *   restricted_to: [],
 *   created_at: '2026-01-01T00:00:00Z',
 *   customer_eligibility: 'any',
 *   preserve_on_plan_change: false,
 *   metadata: {},
 * });
 * ```
 */
export const DiscountSchemaObject: BaseGuardian<DiscountSchema> = Guardian
  .object({
    discount_id: Guardian.string(),
    business_id: Guardian.string(),
    type: Guardian.string(),
    code: Guardian.string(),
    amount: Guardian.number(),
    times_used: Guardian.number(),
    restricted_to: Guardian.array(Guardian.string()),
    created_at: Guardian.string(),
    customer_eligibility: Guardian.string(),
    preserve_on_plan_change: Guardian.boolean(),
    metadata: ProductMetadataSchemaObject,
    currency_options: Guardian.array(DiscountCurrencyOptionSchemaObject)
      .nullable().optional(),
    name: Guardian.string().nullable().optional(),
    usage_limit: Guardian.number().nullable().optional(),
    per_customer_usage_limit: Guardian.number().nullable().optional(),
    subscription_cycles: Guardian.number().nullable().optional(),
    starts_at: Guardian.string().nullable().optional(),
    expires_at: Guardian.string().nullable().optional(),
  }).passthrough().describe({
    title: 'Discount',
    description: 'A discount code record.',
  });

/** Type definition for {@link DiscountListSchemaObject}. */
export type DiscountListSchema = {
  items: DiscountSchema[];
};

/**
 * Schema for a page of discounts. An absent `items` normalizes to an empty
 * array.
 *
 * @example
 * ```typescript
 * import { DiscountListSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, page] = DiscountListSchemaObject.safeParse({ items: [] });
 * ```
 */
export const DiscountListSchemaObject: BaseGuardian<DiscountListSchema> =
  Guardian.preprocess(
    (raw: unknown) => {
      // A bare array is the items themselves, as for the other list pages.
      if (Array.isArray(raw)) return { items: raw };
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return { ...obj, items: obj.items ?? [] };
    },
    Guardian.object({
      items: Guardian.array(DiscountSchemaObject),
    }).passthrough().describe({
      title: 'Discount list page',
      description: 'One page of GET /discounts results.',
    }),
  );

/** Type definition for {@link DiscountCustomerSchemaObject}. */
export type DiscountCustomerSchema = {
  customer_id: string;
};

/**
 * Schema for one customer on a discount's allow list.
 *
 * @example
 * ```typescript
 * import { DiscountCustomerSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, entry] = DiscountCustomerSchemaObject.safeParse({ customer_id: 'cus_1' });
 * ```
 */
export const DiscountCustomerSchemaObject: BaseGuardian<
  DiscountCustomerSchema
> = Guardian.object({
  customer_id: Guardian.string(),
}).passthrough().describe({
  title: 'Discount customer',
  description: 'A customer on a discount allow list.',
});

/** Type definition for {@link DiscountCustomerListSchemaObject}. */
export type DiscountCustomerListSchema = {
  items: DiscountCustomerSchema[];
};

/**
 * Schema for a page of a discount's allow list, and for the result of
 * adding customers to it. An absent `items` normalizes to an empty array.
 *
 * @example
 * ```typescript
 * import { DiscountCustomerListSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, page] = DiscountCustomerListSchemaObject.safeParse({
 *   items: [{ customer_id: 'cus_1' }],
 * });
 * ```
 */
export const DiscountCustomerListSchemaObject: BaseGuardian<
  DiscountCustomerListSchema
> = Guardian.preprocess(
  (raw: unknown) => {
    if (Array.isArray(raw)) return { items: raw };
    if (typeof raw !== 'object' || raw === null) return raw;
    const obj = raw as Record<string, unknown>;
    return { ...obj, items: obj.items ?? [] };
  },
  Guardian.object({
    items: Guardian.array(DiscountCustomerSchemaObject),
  }).passthrough().describe({
    title: 'Discount customer list page',
    description: 'One page of a discount allow list.',
  }),
);
