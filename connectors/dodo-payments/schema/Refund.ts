import { type BaseGuardian, Guardian } from '@guardian';
import {
  type CustomerDetailsSchema,
  CustomerDetailsSchemaObject,
} from './Common.ts';
import {
  type ProductMetadataSchema,
  ProductMetadataSchemaObject,
} from './Product.ts';

/**
 * The states a refund can be in. `succeeded` is the only one in which the
 * money has gone back to the customer; `pending` and `review` are still
 * in flight, and Dodo refuses another refund on the payment until they
 * finish.
 */
export const REFUND_STATUSES = [
  'succeeded',
  'failed',
  'pending',
  'review',
] as const;

/** Type definition for {@link RefundStatusSchemaObject}. */
export type RefundStatusSchema = typeof REFUND_STATUSES[number];

/**
 * Schema for a refund's status.
 *
 * @example
 * ```typescript
 * import { RefundStatusSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, status] = RefundStatusSchemaObject.safeParse('pending');
 * ```
 */
export const RefundStatusSchemaObject: BaseGuardian<RefundStatusSchema> =
  Guardian.enum(REFUND_STATUSES).describe({
    title: 'Refund status',
    description:
      'succeeded, failed, pending or review. Only succeeded means the money went back.',
  });

/**
 * The kinds of reference a card network or bank gives a refund, as
 * `network_reference_type` names them: an ARN, a STAN, an RRN, or
 * `other`.
 */
export const REFUND_NETWORK_REFERENCE_TYPES = [
  'acquirer_reference_number',
  'system_trace_audit_number',
  'retrieval_reference_number',
  'other',
] as const;

/** Type definition for {@link RefundItemRequestSchemaObject}. */
export type RefundItemRequestSchema = {
  /**
   * The line of the payment to refund: the `product_id` of a product in
   * its cart, or an add-on's id, as Dodo documents it.
   */
  item_id: string;
  /**
   * How much of the line to refund, in the currency's smallest unit.
   * Omitted or `null` refunds the whole line.
   */
  amount?: number | null;
  /**
   * Whether `amount` includes tax. Dodo's default is `true`: the
   * customer gets back `amount` and the tax on it is part of it.
   */
  tax_inclusive?: boolean;
};

/** Dodo types an item amount as a 32-bit integer. */
const INT32_MAX = 2_147_483_647;

/**
 * Schema for one `items` entry of a refund request.
 *
 * @example
 * ```typescript
 * import { RefundItemRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * // $5.00 back on one product line, tax included.
 * const [error, item] = RefundItemRequestSchemaObject.safeParse({
 *   item_id: 'pdt_1',
 *   amount: 500,
 * });
 * ```
 */
export const RefundItemRequestSchemaObject: BaseGuardian<
  RefundItemRequestSchema
> = Guardian.object({
  item_id: Guardian.string().notEmpty(
    '`item_id` must be the product or add-on id of a line of the payment',
  ),
  amount: Guardian.number().strict().integer().min(
    1,
    '`amount` must be a positive amount in minor units; omit it to refund the whole line',
  ).max(INT32_MAX, '`amount` is too large').nullable().optional(),
  tax_inclusive: Guardian.boolean().strict().optional(),
}).strict().describe({
  title: 'Refund item',
  description: 'One line of the payment to refund, whole or in part.',
});

/** Type definition for {@link CreateRefundRequestSchemaObject}. */
export type CreateRefundRequestSchema = {
  /** The payment to refund. It must have succeeded. */
  payment_id: string;
  /**
   * Omit for a FULL refund of the payment. To refund in
   * part, list the lines to refund, each with the `amount` to give back
   * (or without one, to refund that line whole).
   */
  items?: RefundItemRequestSchema[] | null;
  /** Recorded with the refund. At most 3000 characters. */
  reason?: string | null;
  metadata?: ProductMetadataSchema;
};

/**
 * Schema for `POST /refunds`.
 *
 * Unknown fields are REJECTED rather than dropped: a misspelt `paymentId`
 * or `item` silently dropped would refund the wrong thing, or the whole
 * payment. Numbers and booleans are not coerced from strings. `items`, when
 * sent, lists at least one line and each line once.
 *
 * @example
 * ```typescript
 * import { CreateRefundRequestSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * // A full refund.
 * CreateRefundRequestSchemaObject.safeParse({
 *   payment_id: 'pay_1',
 *   reason: 'Charged twice',
 * });
 *
 * // A partial refund: $5.00 of one product line.
 * const [error, body] = CreateRefundRequestSchemaObject.safeParse({
 *   payment_id: 'pay_1',
 *   items: [{ item_id: 'pdt_1', amount: 500 }],
 *   metadata: { ticket: 'T-42' },
 * });
 * ```
 */
export const CreateRefundRequestSchemaObject: BaseGuardian<
  CreateRefundRequestSchema
> = Guardian.object({
  payment_id: Guardian.string().notEmpty('`payment_id` is required'),
  items: Guardian.array(RefundItemRequestSchemaObject).refine(
    (items) => items.length > 0,
    '`items` must list at least one line; omit it for a full refund',
  ).refine(
    (items) => new Set(items.map((item) => item.item_id)).size === items.length,
    '`items` may list each `item_id` only once',
  ).nullable().optional(),
  reason: Guardian.string().maxLength(
    3000,
    '`reason` must be at most 3000 characters',
  ).nullable().optional(),
  metadata: ProductMetadataSchemaObject.optional(),
}).strict().describe({
  title: 'Create refund request',
  description: 'Body for POST /refunds.',
}) as unknown as BaseGuardian<CreateRefundRequestSchema>;

/**
 * Type definition for {@link RefundListItemSchemaObject} — a refund as
 * `GET /refunds` lists it, and as a payment's own `refunds` carry it.
 */
export type RefundListItemSchema = {
  refund_id: string;
  payment_id: string;
  business_id: string;
  status: RefundStatusSchema;
  created_at: string;
  /** `true` when the refund gave back only part of the payment. */
  is_partial: boolean;
  /** In the currency's smallest unit. */
  amount?: number | null;
  /** ISO 4217 code, uppercase. */
  currency?: string | null;
  reason?: string | null;
  /**
   * The reference the card network or bank gives the refund, which the
   * customer can quote to their bank. `null` until it arrives, usually 1
   * to 3 business days after the refund succeeds.
   */
  network_reference?: string | null;
  /**
   * One of {@link REFUND_NETWORK_REFERENCE_TYPES}, typed as a string so a
   * new kind never fails a read.
   */
  network_reference_type?: string | null;
};

const refundFields = {
  refund_id: Guardian.string(),
  payment_id: Guardian.string(),
  business_id: Guardian.string(),
  status: RefundStatusSchemaObject,
  created_at: Guardian.string(),
  is_partial: Guardian.boolean(),
  amount: Guardian.number().nullable().optional(),
  currency: Guardian.string().nullable().optional(),
  reason: Guardian.string().nullable().optional(),
  network_reference: Guardian.string().nullable().optional(),
  network_reference_type: Guardian.string().nullable().optional(),
};

/**
 * Schema for one entry of a refund list page. Lighter than
 * {@link RefundSchemaObject}: no brand, customer or metadata. Unknown
 * fields pass through.
 *
 * @example
 * ```typescript
 * import { RefundListItemSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, item] = RefundListItemSchemaObject.safeParse({
 *   refund_id: 'ref_1',
 *   payment_id: 'pay_1',
 *   business_id: 'biz_1',
 *   status: 'succeeded',
 *   created_at: '2026-01-01T00:00:00Z',
 *   is_partial: false,
 *   amount: 1999,
 *   currency: 'USD',
 * });
 * ```
 */
export const RefundListItemSchemaObject: BaseGuardian<RefundListItemSchema> =
  Guardian.object(refundFields).passthrough().describe({
    title: 'Refund list item',
    description: 'One entry of a GET /refunds page.',
  });

/**
 * Type definition for {@link RefundSchemaObject} — the full refund record
 * returned by `POST /refunds` and `GET /refunds/{refund_id}`.
 */
export type RefundSchema = RefundListItemSchema & {
  brand_id: string;
  /** The customer of the refunded payment. */
  customer: CustomerDetailsSchema;
  /**
   * What the refund was created with. Dodo documents it as always
   * present; it is optional here because refunds only gained metadata in
   * November 2025, so an older refund may not carry it.
   */
  metadata?: ProductMetadataSchema;
};

/**
 * Schema for a refund record. Unknown fields pass through, as on a
 * payment: Dodo's records grow, and a closed shape would turn an additive
 * vendor change into a `RESPONSE_ERROR` on a refund that already went
 * through.
 *
 * A new refund is usually `pending`: read it again, or wait for the
 * `refund.succeeded` / `refund.failed` webhook, before treating the money
 * as returned.
 *
 * @example
 * ```typescript
 * import { RefundSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, refund] = RefundSchemaObject.safeParse({
 *   refund_id: 'ref_1',
 *   payment_id: 'pay_1',
 *   business_id: 'biz_1',
 *   brand_id: 'brd_1',
 *   status: 'pending',
 *   created_at: '2026-01-01T00:00:00Z',
 *   is_partial: true,
 *   amount: 500,
 *   currency: 'USD',
 *   customer: { customer_id: 'cus_1', email: 'a@example.com', name: 'Ada' },
 *   metadata: {},
 * });
 * ```
 */
export const RefundSchemaObject: BaseGuardian<RefundSchema> = Guardian.object({
  ...refundFields,
  brand_id: Guardian.string(),
  customer: CustomerDetailsSchemaObject,
  metadata: ProductMetadataSchemaObject.optional(),
}).passthrough().describe({
  title: 'Refund',
  description: 'A refund record from POST /refunds or GET /refunds/{id}.',
});

/** Type definition for {@link RefundListSchemaObject}. */
export type RefundListSchema = {
  items: RefundListItemSchema[];
};

/**
 * Schema for a page of refunds. An absent `items` normalizes to an empty
 * array.
 *
 * @example
 * ```typescript
 * import { RefundListSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, page] = RefundListSchemaObject.safeParse({ items: [] });
 * ```
 */
export const RefundListSchemaObject: BaseGuardian<RefundListSchema> = Guardian
  .preprocess(
    (raw: unknown) => {
      // A bare array is the items themselves, as for the other list pages.
      if (Array.isArray(raw)) return { items: raw };
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return { ...obj, items: obj.items ?? [] };
    },
    Guardian.object({
      items: Guardian.array(RefundListItemSchemaObject),
    }).passthrough().describe({
      title: 'Refund list page',
      description: 'One page of GET /refunds results.',
    }),
  );
