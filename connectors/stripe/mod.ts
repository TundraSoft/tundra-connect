/**
 * @module @tundraconnect/stripe
 */

// Export main client class
export { Stripe, type StripeOptions } from './Stripe.ts';

// Export error handling
export * from './errors/mod.ts';

// Export all schema types and objects for advanced usage
export {
  type AddressSchema,
  AddressSchemaObject,
  CAPTURE_METHODS,
  CONFIRMATION_METHODS,
  type CreateCustomerRequestSchema,
  CreateCustomerRequestSchemaObject,
  type CreatePaymentIntentRequestSchema,
  CreatePaymentIntentRequestSchemaObject,
  currencyGuard,
  type CustomerSchema,
  CustomerSchemaObject,
  type ErrorSchema,
  ErrorSchemaObject,
  metadataGuard,
  PAYMENT_INTENT_STATUSES,
  paymentIntentIdGuard,
  type PaymentIntentSchema,
  PaymentIntentSchemaObject,
  secretKeyGuard,
  type SecretKeySchema,
  SETUP_FUTURE_USAGE_VALUES,
  type ShippingSchema,
  ShippingSchemaObject,
  STRIPE_ERROR_TYPES,
  type StripeErrorDetailSchema,
  StripeErrorDetailSchemaObject,
  TAX_EXEMPT_STATUSES,
} from './schema/mod.ts';
