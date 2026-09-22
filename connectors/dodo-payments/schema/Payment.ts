import { type BaseGuardian, Guardian } from '@guardian';
import {
  BillingAddressSchemaObject,
  CustomerDetailsSchemaObject,
  IntentStatusSchemaObject,
} from './Common.ts';

/**
 * Type definition for {@link PaymentSchemaObject} — the full payment
 * record returned by `GET /payments/{payment_id}`.
 *
 * Only the fields this connect's scope actually needs are modelled;
 * everything else Dodo returns passes through untouched (see the schema's
 * own note on why).
 */
export type PaymentSchema = {
  payment_id: string;
  business_id: string;
  brand_id: string;
  /** Total charged, in the currency's SMALLEST unit (cents for USD, yen for JPY). */
  total_amount: number;
  currency: string;
  customer: import('./Common.ts').CustomerDetailsSchema;
  billing: import('./Common.ts').BillingAddressSchema;
  created_at: string;
  digital_products_delivered: boolean;
  metadata: Record<string, string>;
  /** Absent on some historical records — never assume it is set. */
  status?: import('./Common.ts').IntentStatusSchema | null;
  updated_at?: string | null;
  payment_method?: string | null;
  payment_method_type?: string | null;
  card_last_four?: string | null;
  card_network?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  invoice_id?: string | null;
  invoice_url?: string | null;
  payment_link?: string | null;
  subscription_id?: string | null;
  tax?: number | null;
  settlement_amount?: number;
  settlement_currency?: string;
};

/**
 * Schema for a single payment record.
 *
 * Unknown fields pass through. Dodo's payment object is large and actively
 * growing (settlement, dispute, refund, discount and entitlement families
 * all hang off it), and a closed shape would turn any additive vendor
 * change into a `RESPONSE_ERROR` on a status check for a payment that
 * already succeeded — the worst possible moment to start failing.
 *
 * `status` is optional and nullable because the vendor types it that way.
 * Treat a missing status as "unknown", never as success — see
 * `DodoPayments.isPaid`.
 *
 * @example
 * ```typescript
 * import { PaymentSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, payment] = PaymentSchemaObject.safeParse({
 *   payment_id: 'pay_1',
 *   business_id: 'biz_1',
 *   brand_id: 'brd_1',
 *   total_amount: 1999,
 *   currency: 'USD',
 *   customer: { customer_id: 'cus_1', email: 'a@example.com', name: 'Ada' },
 *   billing: { country: 'US' },
 *   created_at: '2026-01-01T00:00:00Z',
 *   digital_products_delivered: true,
 *   metadata: {},
 *   status: 'succeeded',
 * });
 * ```
 */
export const PaymentSchemaObject: BaseGuardian<PaymentSchema> = Guardian.object(
  {
    payment_id: Guardian.string(),
    business_id: Guardian.string(),
    brand_id: Guardian.string(),
    total_amount: Guardian.number(),
    currency: Guardian.string(),
    customer: CustomerDetailsSchemaObject,
    billing: BillingAddressSchemaObject,
    created_at: Guardian.string(),
    digital_products_delivered: Guardian.boolean(),
    metadata: Guardian.record(Guardian.string()),
    status: IntentStatusSchemaObject.nullable().optional(),
    updated_at: Guardian.string().nullable().optional(),
    payment_method: Guardian.string().nullable().optional(),
    payment_method_type: Guardian.string().nullable().optional(),
    card_last_four: Guardian.string().nullable().optional(),
    card_network: Guardian.string().nullable().optional(),
    error_code: Guardian.string().nullable().optional(),
    error_message: Guardian.string().nullable().optional(),
    invoice_id: Guardian.string().nullable().optional(),
    invoice_url: Guardian.string().nullable().optional(),
    payment_link: Guardian.string().nullable().optional(),
    subscription_id: Guardian.string().nullable().optional(),
    tax: Guardian.number().nullable().optional(),
    settlement_amount: Guardian.number().optional(),
    settlement_currency: Guardian.string().optional(),
  },
).passthrough().describe({
  title: 'Payment',
  description:
    'A single payment record as returned by GET /payments/{payment_id}.',
});

/**
 * Type definition for {@link PaymentListItemSchemaObject} — the LIGHTER
 * record returned by `GET /payments`, which omits the heavy nested
 * collections (refunds, disputes, product_cart) a detail fetch includes.
 */
export type PaymentListItemSchema = {
  payment_id: string;
  brand_id: string;
  total_amount: number;
  currency: string;
  customer: import('./Common.ts').CustomerDetailsSchema;
  created_at: string;
  digital_products_delivered: boolean;
  metadata: Record<string, string>;
  status?: import('./Common.ts').IntentStatusSchema | null;
  payment_method?: string | null;
  payment_method_type?: string | null;
  card_last_four?: string | null;
  card_network?: string | null;
  invoice_id?: string | null;
  invoice_url?: string | null;
  subscription_id?: string | null;
};

/**
 * Schema for one entry of a payment list page.
 *
 * @example
 * ```typescript
 * import { PaymentListItemSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, item] = PaymentListItemSchemaObject.safeParse({
 *   payment_id: 'pay_1',
 *   brand_id: 'brd_1',
 *   total_amount: 1999,
 *   currency: 'USD',
 *   customer: { customer_id: 'cus_1', email: 'a@example.com', name: 'Ada' },
 *   created_at: '2026-01-01T00:00:00Z',
 *   digital_products_delivered: true,
 *   metadata: {},
 * });
 * ```
 */
export const PaymentListItemSchemaObject: BaseGuardian<PaymentListItemSchema> =
  Guardian.object({
    payment_id: Guardian.string(),
    brand_id: Guardian.string(),
    total_amount: Guardian.number(),
    currency: Guardian.string(),
    customer: CustomerDetailsSchemaObject,
    created_at: Guardian.string(),
    digital_products_delivered: Guardian.boolean(),
    metadata: Guardian.record(Guardian.string()),
    status: IntentStatusSchemaObject.nullable().optional(),
    payment_method: Guardian.string().nullable().optional(),
    payment_method_type: Guardian.string().nullable().optional(),
    card_last_four: Guardian.string().nullable().optional(),
    card_network: Guardian.string().nullable().optional(),
    invoice_id: Guardian.string().nullable().optional(),
    invoice_url: Guardian.string().nullable().optional(),
    subscription_id: Guardian.string().nullable().optional(),
  }).passthrough().describe({
    title: 'Payment list item',
    description: 'One entry of a GET /payments page.',
  });

/** Type definition for {@link PaymentListSchemaObject}. */
export type PaymentListSchema = {
  items: PaymentListItemSchema[];
};

/**
 * Schema for a page of payments. Dodo paginates with `page_number` /
 * `page_size` query params and returns `{ items: [...] }`.
 *
 * An absent `items` is normalized to an empty array rather than rejected —
 * "this customer has no payments" is an ordinary answer, not a failure.
 *
 * @example
 * ```typescript
 * import { PaymentListSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, page] = PaymentListSchemaObject.safeParse({ items: [] });
 * ```
 */
export const PaymentListSchemaObject: BaseGuardian<PaymentListSchema> = Guardian
  .preprocess(
    (raw: unknown) => {
      // A bare array is treated as the items themselves rather than being
      // spread into an empty page — silently returning `[]` for a body
      // that actually carried results is the worst available outcome.
      if (Array.isArray(raw)) return { items: raw };
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return { ...obj, items: obj.items ?? [] };
    },
    Guardian.object({
      items: Guardian.array(PaymentListItemSchemaObject),
    }).passthrough().describe({
      title: 'Payment list page',
      description: 'One page of GET /payments results.',
    }),
  );
