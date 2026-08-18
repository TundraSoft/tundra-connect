import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';
import {
  currencyCodeGuard,
  type LinkSchema,
  LinkSchemaObject,
  type MoneySchema,
  MoneySchemaObject,
  moneyValueGuard,
} from './Common.ts';

/**
 * Type definition for PayPal's `amount_breakdown` object — optional
 * sub-totals for a purchase unit's total `amount`. When supplied,
 * `item_total + tax_total + shipping + handling + insurance -
 * shipping_discount - discount` must equal the enclosing amount's
 * `value`. Modeled directly against PayPal's documented
 * `amount_breakdown` schema (verified against PayPal's published OpenAPI
 * spec, `checkout_orders_v2.json#/components/schemas/amount_breakdown`).
 */
type _AmountBreakdownShape = {
  /** Subtotal for all items — required when any `items[].unit_amount` is set. */
  item_total?: MoneySchema;
  /** Shipping fee for this purchase unit. */
  shipping?: MoneySchema;
  /** Handling fee for this purchase unit. */
  handling?: MoneySchema;
  /** Total tax for all items — required when any `items[].tax` is set. */
  tax_total?: MoneySchema;
  /** Insurance fee for this purchase unit. */
  insurance?: MoneySchema;
  /** Shipping discount for this purchase unit. */
  shipping_discount?: MoneySchema;
  /** Discount for this purchase unit. */
  discount?: MoneySchema;
};

const _amountBreakdownSchema: BaseGuardian<_AmountBreakdownShape> = Guardian
  .object({
    item_total: MoneySchemaObject.optional(),
    shipping: MoneySchemaObject.optional(),
    handling: MoneySchemaObject.optional(),
    tax_total: MoneySchemaObject.optional(),
    insurance: MoneySchemaObject.optional(),
    shipping_discount: MoneySchemaObject.optional(),
    discount: MoneySchemaObject.optional(),
  }).describe({
    title: 'Amount breakdown',
    description:
      "Optional sub-totals for a purchase unit's amount — item_total + tax_total + shipping + handling + insurance - shipping_discount - discount must equal amount.value when supplied.",
  });

/** Type definition for {@link AmountBreakdownSchemaObject}. */
export type AmountBreakdownSchema = GuardianInfer<
  typeof _amountBreakdownSchema
>;

/** Schema for PayPal's `amount_breakdown` object. */
export const AmountBreakdownSchemaObject: BaseGuardian<
  AmountBreakdownSchema
> = _amountBreakdownSchema;

/**
 * Type definition for PayPal's `amount_with_breakdown` object — a
 * purchase unit's total `amount`: {@link MoneySchema} plus an optional
 * {@link AmountBreakdownSchema}.
 */
type _OrderAmountShape = {
  /** Three-character ISO-4217 currency code. */
  currency_code: string;
  /** Decimal-string total for this purchase unit — must be positive. */
  value: string;
  /** Optional itemized breakdown of `value` — see {@link AmountBreakdownSchema}. */
  breakdown?: AmountBreakdownSchema;
};

const _orderAmountSchema: BaseGuardian<_OrderAmountShape> = Guardian.object({
  currency_code: currencyCodeGuard,
  value: moneyValueGuard,
  breakdown: AmountBreakdownSchemaObject.optional(),
}).describe({
  title: 'Order amount',
  description:
    "A purchase unit's total amount, with an optional itemized breakdown.",
});

/** Type definition for {@link OrderAmountSchemaObject}. */
export type OrderAmountSchema = GuardianInfer<typeof _orderAmountSchema>;

/** Schema for PayPal's `amount_with_breakdown` object. */
export const OrderAmountSchemaObject: BaseGuardian<OrderAmountSchema> =
  _orderAmountSchema;

/**
 * Type definition for PayPal's `item_request` object — one line item in a
 * purchase unit. `quantity`'s pattern (`^[1-9][0-9]{0,9}$`) is confirmed
 * against PayPal's published OpenAPI spec.
 */
type _ItemShape = {
  /** Item name or title (truncated to 127 characters in PayPal's response). */
  name: string;
  /** Item quantity, as a positive integer STRING (e.g. `"2"`), not a number. */
  quantity: string;
  /** Price per unit. If set, the enclosing purchase unit's `amount.breakdown.item_total` is required. */
  unit_amount: MoneySchema;
  /** Detailed item description. */
  description?: string;
  /** Stock-keeping unit for the item. */
  sku?: string;
  /** Item category. */
  category?: 'DIGITAL_GOODS' | 'PHYSICAL_GOODS' | 'DONATION';
};

const _itemSchema: BaseGuardian<_ItemShape> = Guardian.object({
  name: Guardian.string().minLength(1).maxLength(127),
  quantity: Guardian.string().pattern(
    /^[1-9][0-9]{0,9}$/,
    'quantity must be a positive integer string, e.g. "2"',
  ),
  unit_amount: MoneySchemaObject,
  description: Guardian.string().maxLength(127).optional(),
  sku: Guardian.string().maxLength(127).optional(),
  category: Guardian.enum(
    ['DIGITAL_GOODS', 'PHYSICAL_GOODS', 'DONATION'] as const,
  ).optional(),
}).describe({
  title: 'Item',
  description: 'One line item that the customer purchases from the merchant.',
});

/** Type definition for {@link ItemSchemaObject}. */
export type ItemSchema = GuardianInfer<typeof _itemSchema>;

/** Schema for PayPal's `item`/`item_request` object. */
export const ItemSchemaObject: BaseGuardian<ItemSchema> = _itemSchema;

/**
 * Type definition for PayPal's `payee` object — the merchant who receives
 * payment for a purchase unit. Not modeled further than these two fields
 * (out of v1 scope: `payee.merchant_id` sub-schema validation).
 */
type _PayeeShape = {
  /** The payee's PayPal email address. */
  email_address?: string;
  /** The payee's PayPal-assigned merchant/account ID. */
  merchant_id?: string;
};

const _payeeSchema: BaseGuardian<_PayeeShape> = Guardian.object({
  email_address: Guardian.string().optional(),
  merchant_id: Guardian.string().optional(),
}).describe({
  title: 'Payee',
  description: 'The merchant who receives payment for a purchase unit.',
});

/** Type definition for {@link PayeeSchemaObject}. */
export type PayeeSchema = GuardianInfer<typeof _payeeSchema>;

/** Schema for PayPal's `payee`/`payee_base` object. */
export const PayeeSchemaObject: BaseGuardian<PayeeSchema> = _payeeSchema;

/**
 * Type definition for PayPal's `order_application_context` object,
 * scoped to the four fields this connect's v1 surface supports:
 * `brand_name`, `return_url`, `cancel_url`, `user_action`.
 *
 * PayPal's own docs now mark the whole `application_context` object
 * DEPRECATED in favor of `payment_source.paypal.experience_context` — but
 * it remains functional and is still the field most existing PayPal
 * integrations use, which is why it's what this connect models; the
 * newer `payment_source.paypal.experience_context` path is out of scope
 * for v1 (see `payment_source`'s broader out-of-scope note on
 * {@link CreateOrderRequestSchema}).
 */
type _ApplicationContextShape = {
  /** Label shown instead of the PayPal business name on the PayPal site. */
  brand_name?: string;
  /** URL the payer is redirected to after approving the payment. */
  return_url?: string;
  /** URL the payer is redirected to after cancelling the payment. */
  cancel_url?: string;
  /** Configures a "Continue" vs "Pay Now" checkout flow. Defaults to `CONTINUE`. */
  user_action?: 'CONTINUE' | 'PAY_NOW';
};

const _applicationContextSchema: BaseGuardian<_ApplicationContextShape> =
  Guardian.object({
    brand_name: Guardian.string().maxLength(127).optional(),
    return_url: Guardian.string().optional(),
    cancel_url: Guardian.string().optional(),
    user_action: Guardian.enum(['CONTINUE', 'PAY_NOW'] as const).optional(),
  }).describe({
    title: 'Application context',
    description:
      "Customizes the payer's approval experience. See this type's doc comment for PayPal's deprecation note.",
  });

/** Type definition for {@link ApplicationContextSchemaObject}. */
export type ApplicationContextSchema = GuardianInfer<
  typeof _applicationContextSchema
>;

/** Schema for PayPal's (deprecated but functional) `order_application_context` object. */
export const ApplicationContextSchemaObject: BaseGuardian<
  ApplicationContextSchema
> = _applicationContextSchema;

/**
 * Type definition for PayPal's `purchase_unit_request` object — one
 * purchase unit in a Create Order request.
 */
type _PurchaseUnitRequestShape = {
  /** Caller-provided external ID for this purchase unit. Required when there are multiple purchase units. */
  reference_id?: string;
  /** Total amount for this purchase unit. */
  amount: OrderAmountSchema;
  /** Items the customer purchases from the merchant. */
  items?: ItemSchema[];
  /** The merchant who receives payment for this purchase unit. */
  payee?: PayeeSchema;
  /** Caller-provided external ID, for reconciliation. Not visible to the payer. */
  custom_id?: string;
  /** Caller-provided external invoice number. Visible to the payer. */
  invoice_id?: string;
  /** Purchase description. */
  description?: string;
};

const _purchaseUnitRequestSchema: BaseGuardian<_PurchaseUnitRequestShape> =
  Guardian.object({
    reference_id: Guardian.string().minLength(1).maxLength(256).optional(),
    amount: OrderAmountSchemaObject,
    items: Guardian.array(ItemSchemaObject).optional(),
    payee: PayeeSchemaObject.optional(),
    custom_id: Guardian.string().minLength(1).maxLength(255).optional(),
    invoice_id: Guardian.string().minLength(1).maxLength(127).optional(),
    description: Guardian.string().minLength(1).maxLength(3000).optional(),
  }).describe({
    title: 'Purchase unit request',
    description:
      'One purchase unit of a Create Order request — establishes a contract between payer and payee.',
  });

/** Type definition for {@link PurchaseUnitRequestSchemaObject}. */
export type PurchaseUnitRequestSchema = GuardianInfer<
  typeof _purchaseUnitRequestSchema
>;

/** Schema for PayPal's `purchase_unit_request` object. */
export const PurchaseUnitRequestSchemaObject: BaseGuardian<
  PurchaseUnitRequestSchema
> = _purchaseUnitRequestSchema;

/**
 * Type definition for `createOrder`'s request body
 * (`POST /v2/checkout/orders`) — PayPal's `order_request` object.
 *
 * `payer` and `payment_source` are both out of this connect's v1 scope:
 * `payer` is itself documented as DEPRECATED in favor of
 * `payment_source.paypal`, and `payment_source` is a large
 * vendor-payment-method discriminated union (card, PayPal wallet, Venmo,
 * BLIK, iDEAL, Giropay, Sofort, Trustly, P24, MyBank, Bancontact, EPS,
 * Apple Pay, Google Pay, crypto, ...) — modeling it fully is a much
 * larger surface than this v1 connector's order/capture/refund lifecycle
 * warrants. `payer` is accepted here as an opaque passthrough value (not
 * independently validated) so a caller can still set it if needed;
 * `payment_source` is not accepted at all in v1.
 */
type _CreateOrderRequestShape = {
  /** Whether to capture payment immediately or authorize it for later capture. */
  intent: 'CAPTURE' | 'AUTHORIZE';
  /** 1-10 purchase units — each a contract between payer and payee. */
  purchase_units: PurchaseUnitRequestSchema[];
  /** Customizes the payer's approval experience — see {@link ApplicationContextSchema}. */
  application_context?: ApplicationContextSchema;
  /** DEPRECATED by PayPal in favor of `payment_source.paypal` — accepted here as an opaque passthrough value. */
  payer?: unknown;
};

const _createOrderRequestSchema: BaseGuardian<_CreateOrderRequestShape> =
  Guardian.object({
    intent: Guardian.enum(['CAPTURE', 'AUTHORIZE'] as const),
    purchase_units: Guardian.array(PurchaseUnitRequestSchemaObject)
      .minLength(1)
      .maxLength(10),
    application_context: ApplicationContextSchemaObject.optional(),
    payer: Guardian.unknown().optional(),
  }).describe({
    title: 'Create order request',
    description:
      'Request body for POST /v2/checkout/orders, validated before the API call.',
  });

/** Type definition for {@link CreateOrderRequestSchemaObject}. */
export type CreateOrderRequestSchema = GuardianInfer<
  typeof _createOrderRequestSchema
>;

/** Schema for the `createOrder` request body. */
export const CreateOrderRequestSchemaObject: BaseGuardian<
  CreateOrderRequestSchema
> = _createOrderRequestSchema;

/** PayPal's documented `capture_status` enum values. */
type _CaptureStatus =
  | 'COMPLETED'
  | 'DECLINED'
  | 'PARTIALLY_REFUNDED'
  | 'PENDING'
  | 'REFUNDED'
  | 'FAILED';

/**
 * Type definition for PayPal's `capture` object — a captured payment, as
 * returned in `purchase_units[].payments.captures[]` after a capture.
 */
type _CaptureShape = {
  /** PayPal-generated ID for the captured payment — pass to `refundCapture`. */
  id: string;
  /** Status of the captured payment. */
  status: _CaptureStatus;
  /** Amount for this captured payment. */
  amount?: MoneySchema;
  /** Whether additional captures can be made against the authorized payment. */
  final_capture?: boolean;
  /** Caller-provided external invoice number for this order. */
  invoice_id?: string;
  /** Caller-provided external ID, for reconciliation. */
  custom_id?: string;
};

const _captureSchema: BaseGuardian<_CaptureShape> = Guardian.object({
  id: Guardian.string(),
  status: Guardian.enum(
    [
      'COMPLETED',
      'DECLINED',
      'PARTIALLY_REFUNDED',
      'PENDING',
      'REFUNDED',
      'FAILED',
    ] as const,
  ),
  amount: MoneySchemaObject.optional(),
  final_capture: Guardian.boolean().optional(),
  invoice_id: Guardian.string().optional(),
  custom_id: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Capture',
  description: 'A captured payment for a purchase unit.',
});

/** Type definition for {@link CaptureSchemaObject}. */
export type CaptureSchema = GuardianInfer<typeof _captureSchema>;

/** Schema for PayPal's `capture` object. */
export const CaptureSchemaObject: BaseGuardian<CaptureSchema> = _captureSchema;

/**
 * Type definition for PayPal's `payment_collection` object, scoped to
 * `captures` — the `authorizations`/`refunds` arrays PayPal also documents
 * on this object are out of this connect's v1 scope (no `authorizeOrder`
 * method is implemented, and refunds are read from `refundCapture`'s own
 * return value, not read back off the order).
 */
type _PaymentCollectionShape = {
  /** Captured payments for this purchase unit. */
  captures?: CaptureSchema[];
};

const _paymentCollectionSchema: BaseGuardian<_PaymentCollectionShape> = Guardian
  .object({
    captures: Guardian.array(CaptureSchemaObject).optional(),
  }).passthrough().describe({
    title: 'Payment collection',
    description:
      'The comprehensive history of payments for a purchase unit, scoped to `captures`.',
  });

/** Type definition for {@link PaymentCollectionSchemaObject}. */
export type PaymentCollectionSchema = GuardianInfer<
  typeof _paymentCollectionSchema
>;

/** Schema for PayPal's `payment_collection` object. */
export const PaymentCollectionSchemaObject: BaseGuardian<
  PaymentCollectionSchema
> = _paymentCollectionSchema;

/**
 * Type definition for PayPal's `purchase_unit` object — one purchase unit
 * as returned in an order response (Create/Get/Capture Order).
 */
type _PurchaseUnitShape = {
  /** Caller-provided external ID for this purchase unit. */
  reference_id?: string;
  /** Total amount for this purchase unit. */
  amount?: OrderAmountSchema;
  /** The merchant who receives payment for this purchase unit. */
  payee?: PayeeSchema;
  /** Comprehensive payment history for this purchase unit — see {@link PaymentCollectionSchema}. */
  payments?: PaymentCollectionSchema;
  /** Caller-provided external ID, for reconciliation. */
  custom_id?: string;
  /** Caller-provided external invoice number. */
  invoice_id?: string;
};

const _purchaseUnitSchema: BaseGuardian<_PurchaseUnitShape> = Guardian.object(
  {
    reference_id: Guardian.string().optional(),
    amount: OrderAmountSchemaObject.optional(),
    payee: PayeeSchemaObject.optional(),
    payments: PaymentCollectionSchemaObject.optional(),
    custom_id: Guardian.string().optional(),
    invoice_id: Guardian.string().optional(),
  },
).passthrough().describe({
  title: 'Purchase unit',
  description:
    'One purchase unit of an order response — establishes a contract between payer and payee.',
});

/** Type definition for {@link PurchaseUnitSchemaObject}. */
export type PurchaseUnitSchema = GuardianInfer<typeof _purchaseUnitSchema>;

/** Schema for PayPal's `purchase_unit` (response) object. */
export const PurchaseUnitSchemaObject: BaseGuardian<PurchaseUnitSchema> =
  _purchaseUnitSchema;

/**
 * PayPal's documented `order_status` enum values — confirmed against
 * PayPal's published OpenAPI spec
 * (`checkout_orders_v2.json#/components/schemas/order_status`).
 */
type _OrderStatus =
  | 'CREATED'
  | 'SAVED'
  | 'APPROVED'
  | 'VOIDED'
  | 'COMPLETED'
  | 'PAYER_ACTION_REQUIRED';

/**
 * Type definition for the `createOrder`/`getOrder`/`captureOrder`
 * response body — PayPal's `order` object.
 */
type _OrderShape = {
  /** PayPal-generated order ID. */
  id: string;
  /** Current order status. */
  status: _OrderStatus;
  /** Whether the order captures payment immediately or authorizes it for later capture. */
  intent?: 'CAPTURE' | 'AUTHORIZE';
  /** Purchase units for this order. */
  purchase_units: PurchaseUnitSchema[];
  /** Request-related HATEOAS links, including the payer-approval `rel: "approve"` link. */
  links: LinkSchema[];
  /** ISO 8601 order-creation timestamp. */
  create_time?: string;
  /** ISO 8601 order-last-updated timestamp. */
  update_time?: string;
};

const _orderSchema: BaseGuardian<_OrderShape> = Guardian.object({
  id: Guardian.string(),
  status: Guardian.enum(
    [
      'CREATED',
      'SAVED',
      'APPROVED',
      'VOIDED',
      'COMPLETED',
      'PAYER_ACTION_REQUIRED',
    ] as const,
  ),
  intent: Guardian.enum(['CAPTURE', 'AUTHORIZE'] as const).optional(),
  purchase_units: Guardian.array(PurchaseUnitSchemaObject),
  links: Guardian.array(LinkSchemaObject),
  create_time: Guardian.string().optional(),
  update_time: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Order',
  description:
    'A PayPal order, as returned by Create Order, Get Order, and Capture Order.',
});

/** Type definition for {@link OrderSchemaObject}. */
export type OrderSchema = GuardianInfer<typeof _orderSchema>;

/** Schema for PayPal's `order` object. */
export const OrderSchemaObject: BaseGuardian<OrderSchema> = _orderSchema;
