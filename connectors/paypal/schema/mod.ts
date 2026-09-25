/**
 * Guardian schemas behind `@tundraconnect/paypal`: every request and response
 * shape the client validates, each exported as a schema object with its
 * inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { OrderSchemaObject } from '@tundraconnect/paypal/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = OrderSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export {
  currencyCodeGuard,
  type LinkSchema,
  LinkSchemaObject,
  type MoneySchema,
  MoneySchemaObject,
  moneyValueGuard,
} from './Common.ts';
export {
  type AmountBreakdownSchema,
  AmountBreakdownSchemaObject,
  type ApplicationContextSchema,
  ApplicationContextSchemaObject,
  type CaptureSchema,
  CaptureSchemaObject,
  type CreateOrderRequestSchema,
  CreateOrderRequestSchemaObject,
  type ItemSchema,
  ItemSchemaObject,
  type OrderAmountSchema,
  OrderAmountSchemaObject,
  type OrderSchema,
  OrderSchemaObject,
  type PayeeSchema,
  PayeeSchemaObject,
  type PaymentCollectionSchema,
  PaymentCollectionSchemaObject,
  type PurchaseUnitRequestSchema,
  PurchaseUnitRequestSchemaObject,
  type PurchaseUnitSchema,
  PurchaseUnitSchemaObject,
} from './Order.ts';
export {
  type RefundRequestSchema,
  RefundRequestSchemaObject,
  type RefundSchema,
  RefundSchemaObject,
} from './Refund.ts';
export {
  type ErrorDetailSchema,
  ErrorDetailSchemaObject,
  type ErrorEnvelopeSchema,
  ErrorEnvelopeSchemaObject,
} from './Error.ts';
export {
  type VerifyWebhookResponseSchema,
  VerifyWebhookResponseSchemaObject,
} from './VerifyWebhook.ts';
