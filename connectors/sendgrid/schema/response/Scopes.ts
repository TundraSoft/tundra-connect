import { type BaseGuardian, Guardian } from '@guardian';

/** Type definition for the SendGrid `GET /scopes` response. */
export type ScopesResponseSchema = {
  /** Permission scopes granted to the configured API key. */
  scopes: string[];
};

/**
 * Schema for the SendGrid `GET /scopes` response
 *
 * Validates the list of permission scopes granted to the API key used to
 * authenticate the request — a simple way to confirm a configured key is
 * live and see what it's permitted to do.
 *
 * @example
 * ```typescript
 * import { ScopesResponseSchemaObject } from '@tundraconnect/sendgrid/schemas';
 *
 * const [error, scopes] = ScopesResponseSchemaObject.safeParse({
 *   scopes: ['mail.send', 'alerts.read'],
 * });
 * if (!error) {
 *   console.log(scopes.scopes.includes('mail.send'));
 * }
 * ```
 */
export const ScopesResponseSchemaObject: BaseGuardian<ScopesResponseSchema> =
  Guardian.object({
    /** Permission scopes granted to the configured API key. */
    scopes: Guardian.array(Guardian.string()),
  }).describe({
    title: 'API key scopes',
    description: 'Response body for GET /scopes.',
  });
