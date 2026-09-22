import { type BaseGuardian, Guardian } from '@guardian';
import {
  BillingAddressSchemaObject,
  CustomerDetailsSchemaObject,
  CustomerRequestSchemaObject,
} from './Common.ts';

/** Type definition for {@link ProductCartItemSchemaObject}. */
export type ProductCartItemSchema = {
  product_id: string;
  quantity: number;
  /** Override price in the currency's smallest unit. Omit to use the product's own price. */
  amount?: number | null;
};

/**
 * Schema for one line of a one-time payment's `product_cart`.
 *
 * @example
 * ```typescript
 * import { ProductCartItemSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, item] = ProductCartItemSchemaObject.safeParse({
 *   product_id: 'prd_1',
 *   quantity: 1,
 * });
 * ```
 */
export const ProductCartItemSchemaObject: BaseGuardian<ProductCartItemSchema> =
  Guardian.object({
    product_id: Guardian.string().notEmpty('`product_id` is required'),
    quantity: Guardian.number().integer().min(
      0,
      '`quantity` cannot be negative',
    ),
    amount: Guardian.number().integer().nullable().optional(),
  }).describe({
    title: 'Product cart item',
    description: 'One product line of a one-time payment.',
  });

/** Type definition for {@link CreatePaymentRequestSchemaObject}. */
export type CreatePaymentRequestSchema = {
  product_cart: ProductCartItemSchema[];
  customer: import('./Common.ts').CustomerRequestSchema;
  billing: import('./Common.ts').BillingAddressSchema;
  /** `true` asks Dodo for a hosted checkout link in `payment_link`. */
  payment_link?: boolean | null;
  return_url?: string | null;
  metadata?: Record<string, string>;
  discount_code?: string | null;
  discount_codes?: string[] | null;
  billing_currency?: string | null;
  customer_business_name?: string | null;
  tax_id?: string | null;
  force_3ds?: boolean | null;
  payment_method_id?: string | null;
  allowed_payment_method_types?: string[] | null;
  redirect_immediately?: boolean;
  require_phone_number?: boolean;
  show_saved_payment_methods?: boolean;
  short_link?: boolean | null;
  adaptive_currency_fees_inclusive?: boolean | null;
};

/**
 * Schema for `POST /payments` — initialize a one-time payment.
 *
 * `product_cart`, `customer` and `billing` are the only required fields.
 * Pass `payment_link: true` to get a hosted checkout URL back.
 *
 * @example
 * ```typescript
 * import { CreatePaymentRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, body] = CreatePaymentRequestSchemaObject.safeParse({
 *   product_cart: [{ product_id: 'prd_1', quantity: 1 }],
 *   customer: { email: 'a@example.com', name: 'Ada' },
 *   billing: { country: 'US' },
 *   payment_link: true,
 * });
 * ```
 */
export const CreatePaymentRequestSchemaObject: BaseGuardian<
  CreatePaymentRequestSchema
> = Guardian.object({
  product_cart: Guardian.array(ProductCartItemSchemaObject)
    .nonEmpty('`product_cart` must contain at least one product'),
  customer: CustomerRequestSchemaObject,
  billing: BillingAddressSchemaObject,
  payment_link: Guardian.boolean().nullable().optional(),
  return_url: Guardian.string().nullable().optional(),
  metadata: Guardian.record(Guardian.string()).optional(),
  discount_code: Guardian.string().nullable().optional(),
  discount_codes: Guardian.array(Guardian.string()).maxLength(20).nullable()
    .optional(),
  billing_currency: Guardian.string().nullable().optional(),
  customer_business_name: Guardian.string().nullable().optional(),
  tax_id: Guardian.string().nullable().optional(),
  force_3ds: Guardian.boolean().nullable().optional(),
  payment_method_id: Guardian.string().nullable().optional(),
  allowed_payment_method_types: Guardian.array(Guardian.string()).nullable()
    .optional(),
  redirect_immediately: Guardian.boolean().optional(),
  require_phone_number: Guardian.boolean().optional(),
  show_saved_payment_methods: Guardian.boolean().optional(),
  short_link: Guardian.boolean().nullable().optional(),
  adaptive_currency_fees_inclusive: Guardian.boolean().nullable().optional(),
}).describe({
  title: 'Create payment request',
  description: 'Body for POST /payments — initialize a one-time payment.',
});

/** Type definition for {@link CreatePaymentResponseSchemaObject}. */
export type CreatePaymentResponseSchema = {
  payment_id: string;
  /** Total to be charged, in the currency's smallest unit. */
  total_amount: number;
  /**
   * Secret for confirming this payment from a client SDK. Treat it as a
   * credential: never log it and never expose it beyond the buyer's own
   * session.
   */
  client_secret: string;
  customer: import('./Common.ts').CustomerDetailsSchema;
  metadata: Record<string, string>;
  /** Hosted checkout URL, present when `payment_link: true` was requested. */
  payment_link?: string | null;
  expires_on?: string | null;
  discount_ids?: string[] | null;
  product_cart?: unknown[] | null;
};

/**
 * Schema for the `POST /payments` response.
 *
 * @example
 * ```typescript
 * import { CreatePaymentResponseSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, created] = CreatePaymentResponseSchemaObject.safeParse({
 *   payment_id: 'pay_1',
 *   total_amount: 1999,
 *   client_secret: 'cs_live_x',
 *   customer: { customer_id: 'cus_1', email: 'a@example.com', name: 'Ada' },
 *   metadata: {},
 *   payment_link: 'https://checkout.dodopayments.com/pay_1',
 * });
 * ```
 */
export const CreatePaymentResponseSchemaObject: BaseGuardian<
  CreatePaymentResponseSchema
> = Guardian.object({
  payment_id: Guardian.string(),
  total_amount: Guardian.number(),
  client_secret: Guardian.string(),
  customer: CustomerDetailsSchemaObject,
  metadata: Guardian.record(Guardian.string()),
  payment_link: Guardian.string().nullable().optional(),
  expires_on: Guardian.string().nullable().optional(),
  discount_ids: Guardian.array(Guardian.string()).nullable().optional(),
  product_cart: Guardian.array(Guardian.unknown()).nullable().optional(),
}).passthrough().describe({
  title: 'Create payment response',
  description: 'Result of POST /payments.',
});
