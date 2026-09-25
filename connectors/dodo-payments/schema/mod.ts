/**
 * Guardian schemas behind `@tundraconnect/dodo-payments`: every request and
 * response shape the client validates, each exported as a schema object with
 * its inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { PaymentSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = PaymentSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export {
  type BillingAddressSchema,
  BillingAddressSchemaObject,
  type CustomerDetailsSchema,
  CustomerDetailsSchemaObject,
  type CustomerRequestSchema,
  CustomerRequestSchemaObject,
  INTENT_STATUSES,
  type IntentStatusSchema,
  IntentStatusSchemaObject,
  SUBSCRIPTION_STATUSES,
  type SubscriptionStatusSchema,
  SubscriptionStatusSchemaObject,
} from './Common.ts';
export {
  type CreatePaymentRequestSchema,
  CreatePaymentRequestSchemaObject,
  type CreatePaymentResponseSchema,
  CreatePaymentResponseSchemaObject,
  type ProductCartItemSchema,
  ProductCartItemSchemaObject,
} from './CreatePayment.ts';
export {
  type CreateSubscriptionRequestSchema,
  CreateSubscriptionRequestSchemaObject,
  type CreateSubscriptionResponseSchema,
  CreateSubscriptionResponseSchemaObject,
} from './CreateSubscription.ts';
export { type CustomerSchema, CustomerSchemaObject } from './Customer.ts';
export {
  type ErrorResponseSchema,
  ErrorResponseSchemaObject,
} from './Error.ts';
export {
  type PaymentListItemSchema,
  PaymentListItemSchemaObject,
  type PaymentListSchema,
  PaymentListSchemaObject,
  type PaymentSchema,
  PaymentSchemaObject,
} from './Payment.ts';
export {
  type SubscriptionListSchema,
  SubscriptionListSchemaObject,
  type SubscriptionSchema,
  SubscriptionSchemaObject,
  TIME_INTERVALS,
  type TimeIntervalSchema,
  TimeIntervalSchemaObject,
} from './Subscription.ts';
