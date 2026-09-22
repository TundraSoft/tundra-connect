import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link CustomerSchemaObject} — the full customer
 * record from `GET /customers/{customer_id}`.
 *
 * Richer than the {@link CustomerDetailsSchema} summary embedded in a
 * payment or subscription: it carries `business_id`, `created_at` and the
 * blocklist fields.
 */
export type CustomerSchema = {
  customer_id: string;
  business_id: string;
  email: string;
  name: string;
  created_at: string;
  phone_number?: string | null;
  metadata?: Record<string, string>;
  /**
   * When the merchant blocked this customer, if they did.
   *
   * Resolved only by the SINGLE-customer route — the vendor leaves it
   * empty on list responses, so an absent value here means "not reported",
   * not "not blocked".
   */
  blocked_at?: string | null;
  /** Blocklist entry behind {@link blocked_at}. */
  blocklist_entry_id?: string | null;
};

/**
 * Schema for a customer record.
 *
 * Unknown fields pass through, for the same reason the payment and
 * subscription schemas do: Dodo's customer object grows (wallets, credit
 * entitlements, portal sessions all hang off it) and an additive vendor
 * change should never fail a profile read.
 *
 * @example
 * ```typescript
 * import { CustomerSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, customer] = CustomerSchemaObject.safeParse({
 *   customer_id: 'cus_1',
 *   business_id: 'biz_1',
 *   email: 'buyer@example.com',
 *   name: 'Ada',
 *   created_at: '2026-01-01T00:00:00Z',
 * });
 * ```
 */
export const CustomerSchemaObject: BaseGuardian<CustomerSchema> = Guardian
  .object({
    customer_id: Guardian.string(),
    business_id: Guardian.string(),
    email: Guardian.string(),
    name: Guardian.string(),
    created_at: Guardian.string(),
    phone_number: Guardian.string().nullable().optional(),
    metadata: Guardian.record(Guardian.string()).optional(),
    blocked_at: Guardian.string().nullable().optional(),
    blocklist_entry_id: Guardian.string().nullable().optional(),
  }).passthrough().describe({
    title: 'Customer',
    description:
      'A customer record as returned by GET /customers/{customer_id}.',
  });
