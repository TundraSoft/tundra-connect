/**
 * A typed client for [PayPal's REST
 * API](https://developer.paypal.com/api/rest/)
 * covering the core Orders v2 payment lifecycle: create an order, check its
 * status, capture payment once the payer approves it, and refund a capture.
 *
 * Typed PayPal client for Orders v2: create, fetch, capture and refund, with
 * automatic OAuth2 tokens, idempotency keys and webhook verification.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`PayPalError` and its code registry).
 *
 * @example
 * ```ts
 * import { PayPal } from '@tundraconnect/paypal';
 *
 * const client = new PayPal({
 *   auth: {
 *     type: 'CUSTOM',
 *     clientId: 'your-client-id',
 *     clientSecret: 'your-client-secret',
 *     environment: 'sandbox',
 *   },
 * });
 *
 * // Create an order.
 * const order = await client.createOrder({
 *   intent: 'CAPTURE',
 *   purchase_units: [
 *     { amount: { currency_code: 'USD', value: '10.00' } },
 *   ],
 * });
 * console.log(order.id, order.status); // e.g. '5O19...', 'CREATED'
 *
 * // Send the payer to the `approve` link returned in `order.links`, then
 * // (after they approve) look the order up again to confirm it's ready...
 * const approved = await client.getOrder(order.id);
 * console.log(approved.status); // 'APPROVED'
 *
 * // ...and capture payment.
 * const captured = await client.captureOrder(order.id);
 * const capture = captured.purchase_units[0]?.payments?.captures?.[0];
 * console.log(capture?.id, capture?.status); // e.g. '3C67...', 'COMPLETED'
 *
 * // Refund it later, in full or in part.
 * await client.refundCapture(capture!.id, {
 *   amount: { currency_code: 'USD', value: '5.00' },
 *   note_to_payer: 'Partial refund for damaged item',
 * });
 * ```
 *
 * @module
 */

// Export main client class
export { PayPal, type PayPalOptions } from './PayPal.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
