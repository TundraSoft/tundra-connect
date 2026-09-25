/**
 * Guardian schemas behind `@tundraconnect/stripe`: every request and response
 * shape the client validates, each exported as a schema object with its
 * inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { PaymentIntentSchemaObject } from '@tundraconnect/stripe/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = PaymentIntentSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export {
  currencyGuard,
  metadataGuard,
  paymentIntentIdGuard,
  secretKeyGuard,
  type SecretKeySchema,
} from './Common.ts';

export {
  type AddressSchema,
  AddressSchemaObject,
  type CreateCustomerRequestSchema,
  CreateCustomerRequestSchemaObject,
  type CustomerSchema,
  CustomerSchemaObject,
  type ShippingSchema,
  ShippingSchemaObject,
  TAX_EXEMPT_STATUSES,
} from './Customer.ts';

export {
  CAPTURE_METHODS,
  CONFIRMATION_METHODS,
  type CreatePaymentIntentRequestSchema,
  CreatePaymentIntentRequestSchemaObject,
  PAYMENT_INTENT_STATUSES,
  type PaymentIntentSchema,
  PaymentIntentSchemaObject,
  SETUP_FUTURE_USAGE_VALUES,
} from './PaymentIntent.ts';

export {
  type ErrorSchema,
  ErrorSchemaObject,
  STRIPE_ERROR_TYPES,
  type StripeErrorDetailSchema,
  StripeErrorDetailSchemaObject,
} from './Error.ts';
