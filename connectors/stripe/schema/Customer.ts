import { type BaseGuardian, Guardian } from '@guardian';
import { metadataGuard } from './Common.ts';

/** Documented `tax_exempt` values. */
export const TAX_EXEMPT_STATUSES = ['none', 'exempt', 'reverse'] as const;

/**
 * Schema for a Stripe postal address, embedded in both the `address`
 * request/response field and `shipping.address`.
 *
 * Every field is optional here: Stripe's create-Customer docs list `line1`
 * without a `?` (implying it's required once an `address` is supplied), but
 * the API itself doesn't enforce that in practice, and the *response*
 * shape returns each field as `string | null` rather than omitting it —
 * modeling every field as optional keeps one schema reusable for both
 * directions instead of needing near-duplicate request/response variants.
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived): JSR's
 * public-API "slow types" check requires the *originating* declaration of
 * any type reachable from the public API to carry an explicit annotation,
 * including a private `const` reached only via `typeof` — so every
 * exported schema in this file pins its shape directly instead.
 */
export type AddressSchema = {
  /** Address line 1 (e.g. street, PO Box). */
  line1?: string | null;
  /** Address line 2 (e.g. apartment, suite, unit). */
  line2?: string | null;
  /** City, district, suburb, town, or village. */
  city?: string | null;
  /** State, county, province, or region. */
  state?: string | null;
  /** ZIP or postal code. */
  postal_code?: string | null;
  /** Two-letter country code (ISO 3166-1 alpha-2). */
  country?: string | null;
};

/** A Stripe postal address. */
export const AddressSchemaObject: BaseGuardian<AddressSchema> = Guardian
  .object({
    line1: Guardian.string().nullable().optional(),
    line2: Guardian.string().nullable().optional(),
    city: Guardian.string().nullable().optional(),
    state: Guardian.string().nullable().optional(),
    postal_code: Guardian.string().nullable().optional(),
    country: Guardian.string().nullable().optional(),
  }).describe({
    title: 'Address',
    description: 'A Stripe postal address.',
  });

/** Schema for a Stripe `shipping` object. */
export type ShippingSchema = {
  /** Shipping address. */
  address?: AddressSchema;
  /** Recipient name. */
  name?: string | null;
  /** Recipient phone (including extension). */
  phone?: string | null;
};

/** A Stripe object's shipping name/address/phone. */
export const ShippingSchemaObject: BaseGuardian<ShippingSchema> = Guardian
  .object({
    address: AddressSchemaObject.optional(),
    name: Guardian.string().nullable().optional(),
    phone: Guardian.string().nullable().optional(),
  }).describe({
    title: 'Shipping information',
    description: "A Stripe object's shipping name/address/phone.",
  });

/**
 * Schema for {@link Stripe.createCustomer} request options.
 *
 * No field is universally required by Stripe's Customers API.
 *
 * @example
 * ```typescript
 * import { CreateCustomerRequestSchemaObject } from '@tundraconnect/stripe/schemas';
 *
 * const [error, options] = CreateCustomerRequestSchemaObject.safeParse({
 *   email: 'jenny@example.com',
 *   name: 'Jenny Rosen',
 * });
 * if (!error) {
 *   console.log('Valid request:', options.email);
 * }
 * ```
 */
export type CreateCustomerRequestSchema = {
  /** Customer's email address (max 512 characters). */
  email?: string;
  /** Customer's full name or business name (max 256 characters). */
  name?: string;
  /** Arbitrary description of the customer. */
  description?: string;
  /** Customer's phone number (max 20 characters). */
  phone?: string;
  /** Arbitrary string key/value metadata. */
  metadata?: Record<string, string>;
  /** Payment method to attach to the customer. */
  payment_method?: string;
  /** Customer's address. */
  address?: AddressSchema;
  /** Customer's shipping information. */
  shipping?: ShippingSchema;
  /** Outstanding account balance, in the customer's default currency. */
  balance?: number;
  /** Customer's tax-exempt status. */
  tax_exempt?: (typeof TAX_EXEMPT_STATUSES)[number];
  /** Customer's preferred locales, in priority order. */
  preferred_locales?: string[];
  /** Prefix used on invoice numbers generated for this customer. */
  invoice_prefix?: string;
};

/** Options accepted by {@link Stripe.createCustomer}, validated before the API call. */
export const CreateCustomerRequestSchemaObject: BaseGuardian<
  CreateCustomerRequestSchema
> = Guardian.object({
  email: Guardian.string().maxLength(512).optional(),
  name: Guardian.string().maxLength(256).optional(),
  description: Guardian.string().optional(),
  phone: Guardian.string().maxLength(20).optional(),
  metadata: metadataGuard.optional(),
  payment_method: Guardian.string().optional(),
  address: AddressSchemaObject.optional(),
  shipping: ShippingSchemaObject.optional(),
  balance: Guardian.number().integer().optional(),
  tax_exempt: Guardian.enum(TAX_EXEMPT_STATUSES).optional(),
  preferred_locales: Guardian.array(Guardian.string()).optional(),
  invoice_prefix: Guardian.string().optional(),
}).describe({
  title: 'Create Customer request',
  description:
    'Options accepted by Stripe.createCustomer(), validated before the API call.',
});

/**
 * Schema for the Stripe Customer resource.
 *
 * Models the commonly-used subset of Stripe's Customer object;
 * `.passthrough()` keeps any unmodeled field reachable at runtime (just
 * untyped) instead of silently dropping it — `.passthrough()` doesn't
 * widen the *type* though (`ObjectGuardian.passthrough()` returns `this`),
 * so `CustomerSchema` below only lists the modeled fields, same as before.
 * `invoice_settings` is validated loosely (`.passthrough()`) since its
 * shape is large and rarely needed in full by callers of this connect.
 *
 * @example
 * ```typescript
 * import { CustomerSchemaObject } from '@tundraconnect/stripe/schemas';
 *
 * const [error, customer] = CustomerSchemaObject.safeParse({
 *   id: 'cus_abc123',
 *   object: 'customer',
 *   address: null,
 *   balance: 0,
 *   created: 1700000000,
 *   currency: null,
 *   default_source: null,
 *   delinquent: false,
 *   description: null,
 *   email: 'jenny@example.com',
 *   invoice_prefix: 'ABC123',
 *   invoice_settings: {},
 *   livemode: false,
 *   metadata: {},
 *   name: 'Jenny Rosen',
 *   next_invoice_sequence: 1,
 *   phone: null,
 *   preferred_locales: [],
 *   shipping: null,
 *   tax_exempt: 'none',
 * });
 * if (!error) {
 *   console.log('Customer id:', customer.id);
 * }
 * ```
 */
export type CustomerSchema = {
  /** Unique identifier of the customer (`cus_...`). */
  id: string;
  /** Object type discriminator. */
  object: 'customer';
  /** Customer's address, if set. */
  address: AddressSchema | null;
  /** Current account balance, in the customer's default currency. */
  balance: number;
  /** Unix timestamp (seconds) the customer was created. */
  created: number;
  /** Three-letter ISO currency code, set once a currency-bearing object is charged. */
  currency: string | null;
  /** Default payment source id, if any. */
  default_source: string | null;
  /** Whether the customer's latest invoice has an unpaid, past-due charge. */
  delinquent: boolean;
  /** Arbitrary description of the customer. */
  description: string | null;
  /** Customer's email address. */
  email: string | null;
  /** Prefix used on invoice numbers generated for this customer. */
  invoice_prefix: string;
  /** Default invoice settings for this customer. */
  invoice_settings: Record<string, unknown>;
  /** Whether this object exists in live mode or test mode. */
  livemode: boolean;
  /** Arbitrary string key/value metadata. */
  metadata: Record<string, string>;
  /** Customer's full name or business name. */
  name: string | null;
  /** The sequence to be used for the customer's next invoice number. */
  next_invoice_sequence: number;
  /** Customer's phone number. */
  phone: string | null;
  /** Customer's preferred locales, in priority order. */
  preferred_locales: string[];
  /** Customer's shipping information, if set. */
  shipping: ShippingSchema | null;
  /** Customer's tax-exempt status. */
  tax_exempt: (typeof TAX_EXEMPT_STATUSES)[number];
};

/** A Stripe Customer resource (commonly-used subset), returned by the Customers endpoints. */
export const CustomerSchemaObject: BaseGuardian<CustomerSchema> = Guardian
  .object({
    id: Guardian.string(),
    object: Guardian.literal('customer'),
    address: AddressSchemaObject.nullable(),
    balance: Guardian.number().integer(),
    created: Guardian.number().integer(),
    currency: Guardian.string().nullable(),
    default_source: Guardian.string().nullable(),
    delinquent: Guardian.boolean(),
    description: Guardian.string().nullable(),
    email: Guardian.string().nullable(),
    invoice_prefix: Guardian.string(),
    invoice_settings: Guardian.object().passthrough(),
    livemode: Guardian.boolean(),
    metadata: Guardian.record(Guardian.string()),
    name: Guardian.string().nullable(),
    next_invoice_sequence: Guardian.number().integer(),
    phone: Guardian.string().nullable(),
    preferred_locales: Guardian.array(Guardian.string()),
    shipping: ShippingSchemaObject.nullable(),
    tax_exempt: Guardian.enum(TAX_EXEMPT_STATUSES),
  }).passthrough().describe({
    title: 'Customer resource',
    description:
      'A Stripe Customer resource (commonly-used subset), returned by the Customers endpoints.',
  });
