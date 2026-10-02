import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link NamedEmailAddressSchemaObject} — an address
 * with a display name, in the REST API's shape.
 *
 * The key is `address`, NOT `email`: Cloudflare's Workers `send_email`
 * binding takes `{ email, name }`, but the REST endpoint this connect
 * wraps takes `{ address, name }`, and the two are not interchangeable.
 */
export type NamedEmailAddressSchema = {
  /** The mailbox, e.g. `support@yourdomain.com`. */
  address: string;
  /** Display name shown by the recipient's mail client, e.g. `Support Team`. */
  name?: string;
};

/**
 * Schema for a named address object, `{ address, name? }`.
 *
 * @example
 * ```typescript
 * import { NamedEmailAddressSchemaObject } from '@tundraconnect/cloudflare-email/schemas';
 *
 * const [error, sender] = NamedEmailAddressSchemaObject.safeParse({
 *   address: 'support@yourdomain.com',
 *   name: 'Support Team',
 * });
 * ```
 */
export const NamedEmailAddressSchemaObject: BaseGuardian<
  NamedEmailAddressSchema
> = Guardian.object({
  address: Guardian.string().email('`address` must be a valid email address'),
  name: Guardian.string().optional(),
}).describe({
  title: 'Named email address',
  description:
    'An email address with an optional display name, as the REST API takes it: { address, name? }.',
});

/**
 * Type definition for {@link EmailAddressSchemaObject} — one address as
 * Cloudflare's REST API accepts it for `from`, `to`, `cc`, `bcc` and
 * `reply_to`: a plain address string, or a {@link NamedEmailAddressSchema}.
 */
export type EmailAddressSchema = string | NamedEmailAddressSchema;

/**
 * Schema for one address: a plain address string or `{ address, name? }`.
 *
 * This validates the WIRE shape only. The `"Name <address>"` string form
 * is a convenience of `SendEmailRequestSchemaObject`, which parses
 * it into the named object before validating — this schema on its own
 * rejects it, since Cloudflare would too.
 *
 * @example
 * ```typescript
 * import { EmailAddressSchemaObject } from '@tundraconnect/cloudflare-email/schemas';
 *
 * EmailAddressSchemaObject.parse('jane@example.com');
 * EmailAddressSchemaObject.parse({ address: 'jane@example.com', name: 'Jane Doe' });
 * ```
 */
export const EmailAddressSchemaObject: BaseGuardian<EmailAddressSchema> =
  Guardian.oneOf(
    [
      Guardian.string().email('must be a valid email address'),
      NamedEmailAddressSchemaObject,
    ],
    'must be a valid email address, a "Name <address>" string, or { address, name? }',
  );
