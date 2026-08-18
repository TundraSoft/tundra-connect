/**
 * @module @tundraconnect/paypal
 */

// Export main client class
export { PayPal, type PayPalOptions } from './PayPal.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
