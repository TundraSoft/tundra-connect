import { type BaseGuardian, Guardian } from '@guardian';
import {
  BillingAddressRequestSchemaObject,
  CustomerDetailsSchemaObject,
  CustomerRequestSchemaObject,
} from './Common.ts';

/** Type definition for {@link CreateSubscriptionRequestSchemaObject}. */
export type CreateSubscriptionRequestSchema = {
  product_id: string;
  quantity: number;
  customer: import('./Common.ts').CustomerRequestSchema;
  billing: import('./Common.ts').BillingAddressSchema;
  /** `true` asks Dodo for a hosted checkout link in `payment_link`. */
  payment_link?: boolean | null;
  return_url?: string | null;
  metadata?: Record<string, string>;
  trial_period_days?: number | null;
  /**
   * @deprecated Dodo's own deprecation: use `discount_codes`. Cannot be
   * combined with it.
   */
  discount_code?: string | null;
  /** Up to 20 codes, applied in order. */
  discount_codes?: string[] | null;
  billing_currency?: string | null;
  customer_business_name?: string | null;
  tax_id?: string | null;
  payment_method_id?: string | null;
  allowed_payment_method_types?: string[] | null;
  redirect_immediately?: boolean;
  require_phone_number?: boolean;
  show_saved_payment_methods?: boolean;
  short_link?: boolean | null;
};

/**
 * Schema for `POST /subscriptions`.
 *
 * @example
 * ```typescript
 * import { CreateSubscriptionRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, body] = CreateSubscriptionRequestSchemaObject.safeParse({
 *   product_id: 'prd_monthly',
 *   quantity: 1,
 *   customer: { email: 'a@example.com', name: 'Ada' },
 *   billing: { country: 'US' },
 *   payment_link: true,
 * });
 * ```
 */
export const CreateSubscriptionRequestSchemaObject: BaseGuardian<
  CreateSubscriptionRequestSchema
> = Guardian.object({
  product_id: Guardian.string().notEmpty('`product_id` is required'),
  quantity: Guardian.number().strict().integer().min(
    1,
    '`quantity` must be at least 1',
  ),
  customer: CustomerRequestSchemaObject,
  billing: BillingAddressRequestSchemaObject,
  payment_link: Guardian.boolean().strict().nullable().optional(),
  return_url: Guardian.string().nullable().optional(),
  metadata: Guardian.record(Guardian.string()).optional(),
  trial_period_days: Guardian.number().strict().integer().nullable().optional(),
  discount_code: Guardian.string().nullable().optional(),
  discount_codes: Guardian.array(Guardian.string()).maxLength(20).nullable()
    .optional(),
  billing_currency: Guardian.string().nullable().optional(),
  customer_business_name: Guardian.string().nullable().optional(),
  tax_id: Guardian.string().nullable().optional(),
  payment_method_id: Guardian.string().nullable().optional(),
  allowed_payment_method_types: Guardian.array(Guardian.string()).nullable()
    .optional(),
  redirect_immediately: Guardian.boolean().strict().optional(),
  require_phone_number: Guardian.boolean().strict().optional(),
  show_saved_payment_methods: Guardian.boolean().strict().optional(),
  short_link: Guardian.boolean().strict().nullable().optional(),
}).strict().refine(
  (req) =>
    req.discount_code === undefined || req.discount_code === null ||
    req.discount_codes === undefined || req.discount_codes === null,
  'send `discount_codes` or the deprecated `discount_code`, not both',
).describe({
  title: 'Create subscription request',
  description: 'Body for POST /subscriptions.',
}) as unknown as BaseGuardian<CreateSubscriptionRequestSchema>;

/** Type definition for {@link CreateSubscriptionResponseSchemaObject}. */
export type CreateSubscriptionResponseSchema = {
  subscription_id: string;
  /** The first charge's payment id — poll it to confirm the sub actually started. */
  payment_id: string;
  customer: import('./Common.ts').CustomerDetailsSchema;
  recurring_pre_tax_amount: number;
  /** `true` when the customer still has to supply a payment method via `payment_link`. */
  payment_method_required: boolean;
  metadata: Record<string, string>;
  client_secret?: string | null;
  payment_link?: string | null;
  expires_on?: string | null;
  discount_ids?: string[] | null;
  trial_amount?: number | null;
};

/**
 * Schema for the `POST /subscriptions` response.
 *
 * A created subscription is NOT yet an active one: when
 * `payment_method_required` is `true` the customer still has to complete
 * checkout at `payment_link`, and the subscription sits in `pending` until
 * they do.
 *
 * @example
 * ```typescript
 * import { CreateSubscriptionResponseSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, created] = CreateSubscriptionResponseSchemaObject.safeParse({
 *   subscription_id: 'sub_1',
 *   payment_id: 'pay_1',
 *   customer: { customer_id: 'cus_1', email: 'a@example.com', name: 'Ada' },
 *   recurring_pre_tax_amount: 1000,
 *   payment_method_required: true,
 *   metadata: {},
 *   payment_link: 'https://checkout.dodopayments.com/sub_1',
 * });
 * ```
 */
export const CreateSubscriptionResponseSchemaObject: BaseGuardian<
  CreateSubscriptionResponseSchema
> = Guardian.object({
  subscription_id: Guardian.string(),
  payment_id: Guardian.string(),
  customer: CustomerDetailsSchemaObject,
  recurring_pre_tax_amount: Guardian.number(),
  payment_method_required: Guardian.boolean(),
  metadata: Guardian.record(Guardian.string()),
  client_secret: Guardian.string().nullable().optional(),
  payment_link: Guardian.string().nullable().optional(),
  expires_on: Guardian.string().nullable().optional(),
  discount_ids: Guardian.array(Guardian.string()).nullable().optional(),
  trial_amount: Guardian.number().nullable().optional(),
}).passthrough().describe({
  title: 'Create subscription response',
  description: 'Result of POST /subscriptions.',
});
