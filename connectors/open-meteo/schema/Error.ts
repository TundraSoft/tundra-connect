import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Open-Meteo's error body, sent with a 4xx/5xx status — e.g.
 * `{ "error": true, "reason": "Cannot initialize ... from invalid String value bogus_var" }`.
 */
export type OpenMeteoErrorBodySchema = {
  /** Always `true` on an error body. */
  error?: boolean;
  /** Free-text explanation. */
  reason?: string;
};

/**
 * Validates Open-Meteo's `{ error, reason }` body. Both fields are optional
 * so a proxy's error page still maps by status.
 *
 * @example
 * ```ts
 * import { OpenMeteoErrorBodySchemaObject } from '@tundraconnect/open-meteo/schemas';
 *
 * const [, body] = OpenMeteoErrorBodySchemaObject.safeParse({ error: true, reason: 'nope' });
 * console.log(body?.reason);
 * ```
 */
export const OpenMeteoErrorBodySchemaObject: BaseGuardian<
  OpenMeteoErrorBodySchema
> = Guardian.object({
  error: Guardian.boolean().strict().optional(),
  reason: Guardian.string().optional(),
}).describe({
  title: 'Open-Meteo error body',
  description: 'The `{ error: true, reason }` body of a refused request.',
});
