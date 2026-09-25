import { type BaseGuardian, Guardian } from '@guardian';
import { type PaymentSchema, PaymentSchemaObject } from './Payment.ts';

/**
 * Schema for {@link Razorpay.listPayments} request options
 * (https://razorpay.com/docs/api/payments/fetch-all-payments/).
 *
 * All fields are optional; Razorpay defaults `count` to `10` server-side
 * when omitted.
 */
export type ListPaymentsRequestSchema = {
  /** Number of records to fetch — defaults to `10`, max `100`. */
  count?: number;
  /** Number of records to skip, for pagination. */
  skip?: number;
};

/** Options accepted by {@link Razorpay.listPayments}, validated before the API call. */
export const ListPaymentsRequestSchemaObject: BaseGuardian<
  ListPaymentsRequestSchema
> = Guardian.object({
  count: Guardian.number().integer().min(1).max(100).optional(),
  skip: Guardian.number().integer().min(0).optional(),
}).describe({
  title: 'List Payments request',
  description:
    'Options accepted by Razorpay.listPayments(), validated before the API call.',
});

/**
 * Schema for the response envelope of `GET /payments`
 * (https://razorpay.com/docs/api/payments/fetch-all-payments/).
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived): JSR's
 * public-API "slow types" check requires the *originating* declaration of
 * any type reachable from the public API to carry an explicit annotation.
 *
 * @example
 * ```typescript
 * import { ListPaymentsResponseSchemaObject } from '@tundraconnect/razorpay/schemas';
 *
 * const [error, page] = ListPaymentsResponseSchemaObject.safeParse({
 *   entity: 'collection',
 *   count: 0,
 *   items: [],
 * });
 * if (!error) {
 *   console.log('Payments returned:', page.count);
 * }
 * ```
 */
export type ListPaymentsResponseSchema = {
  /** Object type discriminator. */
  entity: 'collection';
  /** Number of items in `items`. */
  count: number;
  /** The page of Payment resources. */
  items: PaymentSchema[];
};

/** The collection envelope returned by `GET /payments`. */
export const ListPaymentsResponseSchemaObject: BaseGuardian<
  ListPaymentsResponseSchema
> = Guardian.object({
  entity: Guardian.literal('collection'),
  count: Guardian.number().integer(),
  items: Guardian.array(PaymentSchemaObject),
}).describe({
  title: 'Payments collection',
  description: 'The collection envelope returned by GET /payments.',
});
