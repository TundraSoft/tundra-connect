/**
 * Accept payments and manage subscriptions through
 * [Dodo Payments](https://dodopayments.com), a merchant-of-record platform for
 * digital products. Covers the checkout path end to end: initialize a payment,
 * verify it actually completed, read a customer's history, and create or cancel
 * subscriptions — plus Standard Webhooks signature verification.
 *
 * Typed Dodo Payments client: create and verify payments, manage subscriptions,
 * page through a customer's history, and verify Standard Webhooks signatures.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`DodoPaymentsError` and its code registry).
 *
 * @example
 * ```ts
 * import { DodoPayments } from '@tundraconnect/dodo-payments';
 *
 * const client = new DodoPayments({
 *   auth: { type: 'BEARER', token: 'your-dodo-api-key', prefix: 'Bearer' },
 * });
 *
 * // 1. Initialize a payment and send the buyer to the hosted checkout.
 * const created = await client.createPayment({
 *   product_cart: [{ product_id: 'prd_1', quantity: 1 }],
 *   customer: { email: 'buyer@example.com', name: 'Ada' },
 *   billing: { country: 'DE' },
 *   payment_link: true,
 *   return_url: 'https://example.com/thanks',
 * });
 * console.log(created.payment_link);
 *
 * // 2. Later: only a `succeeded` payment counts as paid.
 * if (await client.isPaid(created.payment_id)) {
 *   console.log('fulfil the order');
 * }
 * ```
 *
 * @module
 */

// Export main client class
export {
  type CancelSubscriptionOptions,
  DEFAULT_MAX_PAGES,
  DEFAULT_PAGE_SIZE,
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  DodoPayments,
  type DodoPaymentsAuth,
  type DodoPaymentsMode,
  type DodoPaymentsOptions,
  type ListPaymentsOptions,
  type ListSubscriptionsOptions,
  LIVE_API,
  TEST_API,
  type VerifyWebhookOptions,
  type WebhookHeadersLike,
} from './DodoPayments.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
