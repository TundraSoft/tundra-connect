import { type BaseGuardian, Guardian } from '@guardian';

/** Type definition for {@link CustomerPortalSessionSchemaObject}. */
export type CustomerPortalSessionSchema = {
  /**
   * The customer's portal URL. It signs them in, so hand it only to that
   * customer.
   */
  link: string;
};

/**
 * Schema for `POST /customers/{id}/customer-portal/session`.
 *
 * @example
 * ```typescript
 * import { CustomerPortalSessionSchemaObject } from '@tundraconnect/dodo-payments/schemas';
 *
 * const [error, session] = CustomerPortalSessionSchemaObject.safeParse({
 *   link: 'https://customer.dodopayments.com/session/abc',
 * });
 * ```
 */
export const CustomerPortalSessionSchemaObject: BaseGuardian<
  CustomerPortalSessionSchema
> = Guardian.object({
  link: Guardian.string().notEmpty(),
}).passthrough().describe({
  title: 'Customer portal session',
  description: 'A sign-in link to the Dodo customer portal.',
});
