/**
 * @module @tundraconnect/dodo-payments
 */

// Export main client class
export {
  type CancelSubscriptionOptions,
  DodoPayments,
  type DodoPaymentsAuth,
  type DodoPaymentsMode,
  type DodoPaymentsOptions,
  type ListPaymentsOptions,
  type ListSubscriptionsOptions,
  LIVE_API,
  TEST_API,
} from './DodoPayments.ts';

// Export webhook signature verification
export {
  DEFAULT_TOLERANCE_SECONDS,
  signedContent,
  type VerifyWebhookOptions,
  verifyWebhookSignature,
  type WebhookHeadersLike,
} from './DodoPaymentsWebhook.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
