import { type BaseGuardian, Guardian, type ObjectGuardian } from '@guardian';
import { TimeIntervalSchemaObject } from './Subscription.ts';

/** Tax categories Dodo applies merchant-of-record tax rules by. */
export const TAX_CATEGORIES = [
  'digital_products',
  'saas',
  'e_book',
  'edtech',
  'live_tutoring',
] as const;

/** Type definition for {@link TaxCategorySchemaObject}. */
export type TaxCategorySchema = typeof TAX_CATEGORIES[number];

/**
 * Schema for a product's tax category.
 *
 * @example
 * ```typescript
 * import { TaxCategorySchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, category] = TaxCategorySchemaObject.safeParse('saas');
 * ```
 */
export const TaxCategorySchemaObject: BaseGuardian<TaxCategorySchema> = Guardian
  .enum(TAX_CATEGORIES).describe({
    title: 'Tax category',
    description: 'Tax category Dodo applies merchant-of-record tax rules by.',
  });

/** One product metadata value. Dodo stores strings, numbers and booleans. */
export type ProductMetadataValueSchema = string | number | boolean;

/** Type definition for {@link ProductMetadataSchemaObject}. */
export type ProductMetadataSchema = Record<string, ProductMetadataValueSchema>;

/**
 * Schema for product metadata: your own key-value data, such as the id of
 * the plan a product was synced from.
 *
 * Values keep their type. A number stays a number and a string stays a
 * string, so a lookup by metadata compares like with like.
 *
 * @example
 * ```typescript
 * import { ProductMetadataSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, metadata] = ProductMetadataSchemaObject.safeParse({
 *   plan_code: 'pro_monthly',
 *   seats: 5,
 * });
 * ```
 */
export const ProductMetadataSchemaObject: BaseGuardian<ProductMetadataSchema> =
  // Guardian's string/number/boolean guards coerce between each other
  // (1 → '1'), so the values are checked by hand to keep their types.
  Guardian.record(Guardian.unknown()).refine(
    (record) =>
      Object.values(record).every((value) =>
        typeof value === 'string' || typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
      ),
    'metadata values must be strings, finite numbers or booleans',
  ).describe({
    title: 'Product metadata',
    description: 'Key-value data stored on a product.',
  }) as unknown as BaseGuardian<ProductMetadataSchema>;

/** Type definition for {@link OneTimePriceSchemaObject}. */
export type OneTimePriceSchema = {
  type: 'one_time_price';
  /**
   * Amount in the currency's smallest unit: `1999` is $19.99. With
   * `pay_what_you_want`, this is the minimum the customer may pay.
   */
  price: number;
  /** ISO 4217 code, uppercase, e.g. `USD`. */
  currency: string;
  /** Discount in basis points: `1250` is 12.5%. */
  discount_bps?: number | null;
  pay_what_you_want?: boolean;
  /** Suggested amount, used only with `pay_what_you_want`. */
  suggested_price?: number | null;
  tax_inclusive?: boolean | null;
  purchasing_power_parity?: boolean;
};

/** Type definition for {@link RecurringPriceSchemaObject}. */
export type RecurringPriceSchema = {
  type: 'recurring_price';
  /** Amount charged each billing cycle, in the currency's smallest unit. */
  price: number;
  /** ISO 4217 code, uppercase, e.g. `USD`. */
  currency: string;
  /** How often the customer is charged: `1` + `Month` bills monthly. */
  payment_frequency_count: number;
  payment_frequency_interval: import('./Subscription.ts').TimeIntervalSchema;
  /**
   * How long the subscription runs before it expires. When it equals the
   * payment frequency, the subscription runs a single cycle and then
   * expires instead of renewing. For an ongoing plan, set a long period
   * such as `20` + `Year`.
   */
  subscription_period_count: number;
  subscription_period_interval: import('./Subscription.ts').TimeIntervalSchema;
  /** Free-trial length in days; `0` means no trial. */
  trial_period_days?: number;
  /** Charge for a paid trial, in minor units. Needs `trial_period_days > 0`. */
  trial_amount?: number | null;
  /** Let a customer start a free trial without a card. */
  trial_payment_method_optional?: boolean;
  /** Whether discount codes reduce a paid trial's charge. */
  trial_apply_discounts?: boolean | null;
  /** Let a customer start without a card when nothing is due today. */
  zero_amount_payment_method_optional?: boolean;
  /** Discount in basis points: `1250` is 12.5%. */
  discount_bps?: number | null;
  tax_inclusive?: boolean | null;
  purchasing_power_parity?: boolean;
};

/**
 * Type definition for {@link UsageBasedPriceSchemaObject}. Read-only here:
 * usage-based products carry meters this connect does not model, so they
 * can be read but not created.
 */
export type UsageBasedPriceSchema = {
  type: 'usage_based_price';
  /** Fixed charge each cycle, on top of metered usage, in minor units. */
  fixed_price: number;
  currency: string;
  payment_frequency_count: number;
  payment_frequency_interval: import('./Subscription.ts').TimeIntervalSchema;
  subscription_period_count: number;
  subscription_period_interval: import('./Subscription.ts').TimeIntervalSchema;
  tax_inclusive?: boolean | null;
};

/** Type definition for {@link PriceSchemaObject}: any price Dodo returns. */
export type PriceSchema =
  | OneTimePriceSchema
  | RecurringPriceSchema
  | UsageBasedPriceSchema;

/** Type definition for {@link ProductPriceRequestSchemaObject}. */
export type ProductPriceRequestSchema =
  | OneTimePriceSchema
  | RecurringPriceSchema;

// Requests refuse numbers and booleans sent as strings (`strict`); responses
// keep Guardian's coercion so a vendor quirk never fails a read.
const num = (strict: boolean) =>
  strict ? Guardian.number().strict() : Guardian.number();
const bool = (strict: boolean) =>
  strict ? Guardian.boolean().strict() : Guardian.boolean();

const minorUnits = (strict: boolean) =>
  num(strict).integer().min(0, 'amounts are non-negative minor units');
const currencyCode = () =>
  Guardian.string().pattern(
    /^[A-Z]{3}$/,
    '`currency` must be an uppercase ISO 4217 code, e.g. USD',
  );
const count = (strict: boolean) =>
  num(strict).integer().min(1, 'interval counts must be at least 1');
const basisPoints = (strict: boolean) =>
  num(strict).integer().min(0).max(
    10_000,
    '`discount_bps` must be between 0 and 10000',
  ).nullable().optional();

// Built by factories so the request branches (strict: unknown fields and
// string-typed numbers rejected) and the response branches (passthrough,
// since Dodo adds price fields over time) are separate guardians over the
// same field rules.
const oneTimeFields = (strict = false) => ({
  type: Guardian.literal('one_time_price'),
  price: minorUnits(strict),
  currency: currencyCode(),
  discount_bps: basisPoints(strict),
  pay_what_you_want: bool(strict).optional(),
  suggested_price: num(strict).integer().min(0).nullable().optional(),
  tax_inclusive: bool(strict).nullable().optional(),
  purchasing_power_parity: bool(strict).optional(),
});

const recurringFields = (strict = false) => ({
  type: Guardian.literal('recurring_price'),
  price: minorUnits(strict),
  currency: currencyCode(),
  payment_frequency_count: count(strict),
  payment_frequency_interval: TimeIntervalSchemaObject,
  subscription_period_count: count(strict),
  subscription_period_interval: TimeIntervalSchemaObject,
  trial_period_days: num(strict).integer().min(0).optional(),
  trial_amount: num(strict).integer().min(0).nullable().optional(),
  trial_payment_method_optional: bool(strict).optional(),
  trial_apply_discounts: bool(strict).nullable().optional(),
  zero_amount_payment_method_optional: bool(strict).optional(),
  discount_bps: basisPoints(strict),
  tax_inclusive: bool(strict).nullable().optional(),
  purchasing_power_parity: bool(strict).optional(),
});

/**
 * Schema for a one-time price, as Dodo returns it.
 *
 * @example
 * ```typescript
 * import { OneTimePriceSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, price] = OneTimePriceSchemaObject.safeParse({
 *   type: 'one_time_price',
 *   price: 4900,
 *   currency: 'USD',
 * });
 * ```
 */
export const OneTimePriceSchemaObject: ObjectGuardian<OneTimePriceSchema> =
  Guardian.object(oneTimeFields()).passthrough().describe({
    title: 'One-time price',
    description: 'A single charge, in minor units.',
  });

/**
 * Schema for a recurring price, as Dodo returns it.
 *
 * @example
 * ```typescript
 * import { RecurringPriceSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, price] = RecurringPriceSchemaObject.safeParse({
 *   type: 'recurring_price',
 *   price: 1500,
 *   currency: 'USD',
 *   payment_frequency_count: 1,
 *   payment_frequency_interval: 'Month',
 *   subscription_period_count: 20,
 *   subscription_period_interval: 'Year',
 * });
 * ```
 */
export const RecurringPriceSchemaObject: ObjectGuardian<RecurringPriceSchema> =
  Guardian.object(recurringFields()).passthrough().describe({
    title: 'Recurring price',
    description: 'A subscription price billed every payment period.',
  });

/**
 * Schema for a usage-based price, as Dodo returns it. Meter fields pass
 * through untyped.
 *
 * @example
 * ```typescript
 * import { UsageBasedPriceSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, price] = UsageBasedPriceSchemaObject.safeParse({
 *   type: 'usage_based_price',
 *   fixed_price: 0,
 *   currency: 'USD',
 *   payment_frequency_count: 1,
 *   payment_frequency_interval: 'Month',
 *   subscription_period_count: 20,
 *   subscription_period_interval: 'Year',
 * });
 * ```
 */
export const UsageBasedPriceSchemaObject: ObjectGuardian<
  UsageBasedPriceSchema
> = Guardian.object({
  type: Guardian.literal('usage_based_price'),
  fixed_price: Guardian.number(),
  currency: Guardian.string(),
  payment_frequency_count: Guardian.number(),
  payment_frequency_interval: TimeIntervalSchemaObject,
  subscription_period_count: Guardian.number(),
  subscription_period_interval: TimeIntervalSchemaObject,
  tax_inclusive: Guardian.boolean().nullable().optional(),
}).passthrough().describe({
  title: 'Usage-based price',
  description: 'A fixed charge plus metered usage, billed each period.',
});

/**
 * Schema for any product price Dodo returns, discriminated on `type`.
 *
 * @example
 * ```typescript
 * import { PriceSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, price] = PriceSchemaObject.safeParse({
 *   type: 'one_time_price',
 *   price: 4900,
 *   currency: 'USD',
 * });
 * if (price?.type === 'recurring_price') console.log(price.payment_frequency_interval);
 * ```
 */
export const PriceSchemaObject: BaseGuardian<PriceSchema> = Guardian
  .discriminatedUnion('type', [
    OneTimePriceSchemaObject,
    RecurringPriceSchemaObject,
    UsageBasedPriceSchemaObject,
  ]).describe({
    title: 'Price',
    description: 'A product price: one-time, recurring or usage-based.',
  });

/**
 * Schema for the price of a product being created or updated: one-time or
 * recurring. Unknown fields are rejected, and numbers and booleans must
 * not arrive as strings.
 *
 * @example
 * ```typescript
 * import { ProductPriceRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * // An ongoing monthly plan: billed every month, running for 20 years.
 * const [error, price] = ProductPriceRequestSchemaObject.safeParse({
 *   type: 'recurring_price',
 *   price: 1500,
 *   currency: 'USD',
 *   payment_frequency_count: 1,
 *   payment_frequency_interval: 'Month',
 *   subscription_period_count: 20,
 *   subscription_period_interval: 'Year',
 *   trial_period_days: 14,
 * });
 * ```
 */
export const ProductPriceRequestSchemaObject: BaseGuardian<
  ProductPriceRequestSchema
> = Guardian.discriminatedUnion('type', [
  Guardian.object(oneTimeFields(true)).strict() as ObjectGuardian<
    OneTimePriceSchema
  >,
  Guardian.object(recurringFields(true)).strict() as ObjectGuardian<
    RecurringPriceSchema
  >,
]).describe({
  title: 'Product price request',
  description: 'Price of a product being created: one-time or recurring.',
});

/** Type definition for {@link CreateProductRequestSchemaObject}. */
export type CreateProductRequestSchema = {
  /** Display name, at most 100 characters. */
  name: string;
  tax_category: TaxCategorySchema;
  price: ProductPriceRequestSchema;
  /** At most 1000 characters. */
  description?: string | null;
  metadata?: ProductMetadataSchema;
  /** Brand to file the product under; the primary brand when omitted. */
  brand_id?: string | null;
  /** Addon ids offered with a subscription product. */
  addons?: string[] | null;
};

const productFields = {
  name: Guardian.string().notEmpty('`name` is required').maxLength(
    100,
    '`name` must be at most 100 characters',
  ),
  description: Guardian.string().maxLength(
    1000,
    '`description` must be at most 1000 characters',
  ).nullable().optional(),
  metadata: ProductMetadataSchemaObject.optional(),
  brand_id: Guardian.string().nullable().optional(),
  addons: Guardian.array(Guardian.string()).nullable().optional(),
};

/**
 * Schema for `POST /products`.
 *
 * @example
 * ```typescript
 * import { CreateProductRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, body] = CreateProductRequestSchemaObject.safeParse({
 *   name: 'Credit pack (500)',
 *   tax_category: 'saas',
 *   price: { type: 'one_time_price', price: 4900, currency: 'USD' },
 *   metadata: { pack_code: 'credits_500' },
 * });
 * ```
 */
export const CreateProductRequestSchemaObject: BaseGuardian<
  CreateProductRequestSchema
> = Guardian.object({
  ...productFields,
  tax_category: TaxCategorySchemaObject,
  price: ProductPriceRequestSchemaObject,
}).strict().describe({
  title: 'Create product request',
  description: 'Body for POST /products.',
});

/**
 * Type definition for {@link UpdateProductRequestSchemaObject}. Every field
 * is optional; an omitted field is left unchanged.
 */
export type UpdateProductRequestSchema = {
  name?: string;
  description?: string | null;
  /** Sent as given; check Dodo's reference for merge-versus-replace. */
  metadata?: ProductMetadataSchema;
  tax_category?: TaxCategorySchema;
  /**
   * Replaces the product's price. Creating a new product instead leaves
   * existing subscriptions on the product they bought.
   */
  price?: ProductPriceRequestSchema;
  brand_id?: string | null;
  addons?: string[] | null;
};

/**
 * Schema for `PATCH /products/{id}`. An empty update is rejected locally,
 * since it would be a request that changes nothing.
 *
 * @example
 * ```typescript
 * import { UpdateProductRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, body] = UpdateProductRequestSchemaObject.safeParse({
 *   name: 'Pro (monthly)',
 *   metadata: { plan_code: 'pro_monthly' },
 * });
 * ```
 */
export const UpdateProductRequestSchemaObject: BaseGuardian<
  UpdateProductRequestSchema
> = Guardian.object({
  ...productFields,
  name: productFields.name.optional(),
  tax_category: TaxCategorySchemaObject.optional(),
  price: ProductPriceRequestSchemaObject.optional(),
}).strict().refine(
  (update) => Object.values(update).some((value) => value !== undefined),
  'an update must change at least one field',
).describe({
  title: 'Update product request',
  description: 'Body for PATCH /products/{id}.',
}) as unknown as BaseGuardian<UpdateProductRequestSchema>;

/** Type definition for {@link ProductSchemaObject}. */
export type ProductSchema = {
  product_id: string;
  business_id: string;
  created_at: string;
  updated_at: string;
  /** `true` for a subscription product. */
  is_recurring: boolean;
  /** One of {@link TAX_CATEGORIES}; typed as a string so a new category never fails a read. */
  tax_category: string;
  price: PriceSchema;
  metadata: ProductMetadataSchema;
  brand_id?: string;
  name?: string | null;
  description?: string | null;
  image?: string | null;
  addons?: string[] | null;
  product_collection_id?: string | null;
};

/**
 * Schema for a product record, from `GET /products/{id}` and
 * `POST /products`.
 *
 * Unknown fields pass through: entitlements, digital delivery and license
 * keys hang off this object and are outside this connect's scope.
 *
 * @example
 * ```typescript
 * import { ProductSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, product] = ProductSchemaObject.safeParse({
 *   product_id: 'pdt_1',
 *   business_id: 'biz_1',
 *   created_at: '2026-01-01T00:00:00Z',
 *   updated_at: '2026-01-01T00:00:00Z',
 *   is_recurring: false,
 *   tax_category: 'saas',
 *   price: { type: 'one_time_price', price: 4900, currency: 'USD' },
 *   metadata: {},
 * });
 * ```
 */
export const ProductSchemaObject: BaseGuardian<ProductSchema> = Guardian
  .object({
    product_id: Guardian.string(),
    business_id: Guardian.string(),
    created_at: Guardian.string(),
    updated_at: Guardian.string(),
    is_recurring: Guardian.boolean(),
    tax_category: Guardian.string(),
    price: PriceSchemaObject,
    metadata: ProductMetadataSchemaObject,
    brand_id: Guardian.string().optional(),
    name: Guardian.string().nullable().optional(),
    description: Guardian.string().nullable().optional(),
    image: Guardian.string().nullable().optional(),
    addons: Guardian.array(Guardian.string()).nullable().optional(),
    product_collection_id: Guardian.string().nullable().optional(),
  }).passthrough().describe({
    title: 'Product',
    description: 'A product record.',
  });

/** Type definition for {@link ProductListItemSchemaObject}. */
export type ProductListItemSchema = {
  product_id: string;
  business_id: string;
  created_at: string;
  updated_at: string;
  is_recurring: boolean;
  tax_category: string;
  metadata: ProductMetadataSchema;
  name?: string | null;
  description?: string | null;
  image?: string | null;
  /** Base amount in minor units; the full price is in `price_detail`. */
  price?: number | null;
  currency?: string | null;
  price_detail?: PriceSchema | null;
  tax_inclusive?: boolean | null;
};

/**
 * Schema for one entry of `GET /products`. Lighter than
 * {@link ProductSchemaObject}: the price is split into `price`, `currency`
 * and `price_detail`.
 *
 * @example
 * ```typescript
 * import { ProductListItemSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, item] = ProductListItemSchemaObject.safeParse({
 *   product_id: 'pdt_1',
 *   business_id: 'biz_1',
 *   created_at: '2026-01-01T00:00:00Z',
 *   updated_at: '2026-01-01T00:00:00Z',
 *   is_recurring: false,
 *   tax_category: 'saas',
 *   metadata: { pack_code: 'credits_500' },
 * });
 * ```
 */
export const ProductListItemSchemaObject: BaseGuardian<ProductListItemSchema> =
  Guardian.object({
    product_id: Guardian.string(),
    business_id: Guardian.string(),
    created_at: Guardian.string(),
    updated_at: Guardian.string(),
    is_recurring: Guardian.boolean(),
    tax_category: Guardian.string(),
    metadata: ProductMetadataSchemaObject,
    name: Guardian.string().nullable().optional(),
    description: Guardian.string().nullable().optional(),
    image: Guardian.string().nullable().optional(),
    price: Guardian.number().nullable().optional(),
    currency: Guardian.string().nullable().optional(),
    price_detail: PriceSchemaObject.nullable().optional(),
    tax_inclusive: Guardian.boolean().nullable().optional(),
  }).passthrough().describe({
    title: 'Product list item',
    description: 'One entry of GET /products.',
  });

/** Type definition for {@link ProductListSchemaObject}. */
export type ProductListSchema = {
  items: ProductListItemSchema[];
};

/**
 * Schema for a page of products. An absent `items` normalizes to an empty
 * array.
 *
 * @example
 * ```typescript
 * import { ProductListSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, page] = ProductListSchemaObject.safeParse({ items: [] });
 * ```
 */
export const ProductListSchemaObject: BaseGuardian<ProductListSchema> = Guardian
  .preprocess(
    (raw: unknown) => {
      // A bare array is the items themselves, as for the other list pages.
      if (Array.isArray(raw)) return { items: raw };
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return { ...obj, items: obj.items ?? [] };
    },
    Guardian.object({
      items: Guardian.array(ProductListItemSchemaObject),
    }).passthrough().describe({
      title: 'Product list page',
      description: 'One page of GET /products results.',
    }),
  );
