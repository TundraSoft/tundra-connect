import { type BaseGuardian, Guardian } from '@guardian';
import { codGuard, type CodSchema } from './Common.ts';

/**
 * Schema for OpenWeatherMap's documented error envelope, returned on
 * non-2xx responses — e.g.
 * `{ cod: 401, message: 'Invalid API key. Please see https://openweathermap.org/faq#error401 for more info.' }`.
 *
 * Both fields are modeled as optional: OpenWeatherMap does not publish a
 * formal schema for its error body the way it does for `/weather` and
 * `/forecast`, `__toError` only ever reads them defensively via optional
 * chaining, and there is no guarantee every failure path (e.g. an
 * upstream/proxy error page for a 5xx) returns a body that matches this
 * shape at all — see `../docs/OpenWeatherMap-Errors.md`. `cod` reuses the
 * shared {@link codGuard} because, exactly like the success schemas, it is
 * inconsistently typed as a number on some endpoints and a numeric string
 * on others (see `codGuard`'s doc comment in `./Common.ts`).
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived): JSR's
 * public-API "slow types" check requires the *originating* declaration of
 * any type reachable from the public API to carry an explicit annotation,
 * so the shape is pinned directly here instead of threaded through an
 * internal helper (mirrors `stripe/schema/Error.ts` and
 * `sendgrid/schema/common/Error.ts`).
 *
 * @example
 * ```typescript
 * import { ErrorSchemaObject } from '@tundraconnect/openweathermap/schemas';
 *
 * const [error, envelope] = ErrorSchemaObject.safeParse({
 *   cod: 401,
 *   message: 'Invalid API key.',
 * });
 * if (!error) {
 *   console.log(envelope.message);
 * }
 * ```
 */
export type ErrorSchema = {
  /** Status code echoed back by the vendor (see {@link codGuard}). */
  cod?: CodSchema;
  /** Free-text description of the error. */
  message?: string;
};

/** Documented error envelope returned by OpenWeatherMap on non-2xx responses. */
export const ErrorSchemaObject: BaseGuardian<ErrorSchema> = Guardian.object({
  /** Status code echoed back by the vendor (see {@link codGuard}). */
  cod: codGuard.optional(),
  /** Free-text description of the error. */
  message: Guardian.string().optional(),
}).describe({
  title: 'OpenWeatherMap error response',
  description:
    'Documented error envelope returned by OpenWeatherMap on non-2xx responses.',
});
