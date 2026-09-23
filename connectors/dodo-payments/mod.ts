/**
 * @module @tundraconnect/dodo-payments
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
