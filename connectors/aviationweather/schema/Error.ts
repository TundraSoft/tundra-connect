import { type BaseGuardian, Guardian } from '@guardian';

/** The Data API's error body, e.g. `{ "status": "error", "error": "Invalid value for hours" }`. */
export type AviationWeatherErrorBodySchema = {
  /** `error`. */
  status?: string;
  /** Free-text explanation. */
  error?: string;
};

/**
 * Validates the Data API's error body. Both fields are optional so a
 * proxy's error page still maps by status.
 *
 * @example
 * ```ts
 * import { AviationWeatherErrorBodySchemaObject } from '@tundraconnect/aviationweather/schemas';
 *
 * const [, body] = AviationWeatherErrorBodySchemaObject.safeParse({ status: 'error', error: 'Invalid value for hours' });
 * console.log(body?.error);
 * ```
 */
export const AviationWeatherErrorBodySchemaObject: BaseGuardian<
  AviationWeatherErrorBodySchema
> = Guardian.object({
  status: Guardian.string().optional(),
  error: Guardian.string().optional(),
}).describe({
  title: 'aviationweather.gov error body',
  description: 'The `{ status, error }` body of a refused request.',
});
