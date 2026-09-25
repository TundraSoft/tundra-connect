/**
 * Typed, cross-runtime client for the [Stripe REST
 * API](https://docs.stripe.com/api), covering PaymentIntent create/retrieve and
 * Customer create.
 *
 * Typed Stripe client: create and retrieve PaymentIntents and create customers,
 * with idempotency keys and webhook signature verification.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`StripeError` and its code registry).
 *
 * @example
 * ```ts
 * import { Stripe } from '@tundraconnect/stripe';
 *
 * const client = new Stripe({
 *   auth: { type: 'BASIC', username: 'sk_test_...', password: '' },
 * });
 *
 * const intent = await client.createPaymentIntent({
 *   amount: 1999,
 *   currency: 'usd',
 *   automatic_payment_methods: { enabled: true },
 * });
 * console.log(intent.id, intent.client_secret);
 *
 * const customer = await client.createCustomer({
 *   email: 'jenny@example.com',
 *   name: 'Jenny Rosen',
 * });
 * console.log(customer.id);
 * ```
 *
 * @module
 */

// Export main client class
export {
  type IdempotentRequestOptions,
  Stripe,
  type StripeOptions,
  type VerifyWebhookOptions,
  type WebhookHeadersLike,
} from './Stripe.ts';

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
