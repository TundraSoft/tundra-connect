/**
 * Typed, cross-runtime client for the [Razorpay REST
 * API](https://razorpay.com/docs/api/), covering Order create/fetch, Payment
 * capture/fetch/list, and Payment Link creation.
 *
 * Typed Razorpay client: create and fetch orders; capture, fetch and list
 * payments; create payment links; and verify webhook signatures.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`RazorpayError` and its code registry).
 *
 * @example
 * ```ts
 * import { Razorpay } from '@tundraconnect/razorpay';
 *
 * const client = new Razorpay({
 *   auth: { type: 'BASIC', username: 'rzp_test_...', password: '...' },
 * });
 *
 * // ₹299.00 is sent as 29900 (paise) — see the paise-amount note above.
 * const order = await client.createOrder({
 *   amount: 29900,
 *   currency: 'INR',
 *   receipt: 'receipt#1',
 * });
 * console.log(order.id, order.status);
 *
 * const payment = await client.capturePayment('pay_...', {
 *   amount: 29900,
 *   currency: 'INR',
 * });
 * console.log(payment.status, payment.captured);
 *
 * const link = await client.createPaymentLink({
 *   amount: 29900,
 *   description: 'Payment for order #1',
 * });
 * console.log(link.short_url);
 * ```
 *
 * @module
 */

// Export main client class
export { Razorpay, type RazorpayOptions } from './Razorpay.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
