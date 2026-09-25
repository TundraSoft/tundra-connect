/**
 * Guardian schemas behind `@tundraconnect/razorpay`: every request and response
 * shape the client validates, each exported as a schema object with its
 * inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { PaymentSchemaObject } from '@tundraconnect/razorpay/schemas';
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
  amountGuard,
  type AmountSchema,
  currencyGuard,
  type CurrencySchema,
  keyIdGuard,
  type KeyIdSchema,
  notesGuard,
  notesResponseGuard,
  type NotesSchema,
  receiptGuard,
  type ReceiptSchema,
} from './Common.ts';

export {
  type CreateOrderRequestSchema,
  CreateOrderRequestSchemaObject,
  ORDER_STATUSES,
  orderIdGuard,
  type OrderSchema,
  OrderSchemaObject,
} from './Order.ts';

export {
  type CapturePaymentRequestSchema,
  CapturePaymentRequestSchemaObject,
  PAYMENT_STATUSES,
  paymentIdGuard,
  type PaymentSchema,
  PaymentSchemaObject,
} from './Payment.ts';

export {
  type CreatePaymentLinkRequestSchema,
  CreatePaymentLinkRequestSchemaObject,
  PAYMENT_LINK_STATUSES,
  type PaymentLinkCustomerSchema,
  PaymentLinkCustomerSchemaObject,
  type PaymentLinkNotifySchema,
  PaymentLinkNotifySchemaObject,
  type PaymentLinkSchema,
  PaymentLinkSchemaObject,
} from './PaymentLink.ts';

export {
  type ListPaymentsRequestSchema,
  ListPaymentsRequestSchemaObject,
  type ListPaymentsResponseSchema,
  ListPaymentsResponseSchemaObject,
} from './ListPayments.ts';

export {
  type RazorpayErrorDetailSchema,
  RazorpayErrorDetailSchemaObject,
  type RazorpayErrorEnvelopeSchema,
  RazorpayErrorEnvelopeSchemaObject,
} from './Error.ts';
