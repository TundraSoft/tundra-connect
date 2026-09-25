import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for Sentry's standard JSON error envelope.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * ErrorSchemaObject>`) so the exported schema below can carry an explicit
 * `BaseGuardian<ErrorSchema>` annotation without a circular reference — JSR's
 * "slow types" check requires the originating declaration of any type
 * reachable from the public API to be explicit.
 */
export type ErrorSchema = {
  /** Human-readable description of what went wrong. */
  detail: string;
  /** Per-field or nested validation messages, present on some 400 responses. */
  causes?: string[];
};

/**
 * Schema for Sentry's standard JSON error envelope (`{ detail, causes? }`),
 * returned on 400/401/403/404 responses — see https://docs.sentry.io/api/.
 * Sentry documents no machine-readable error code, only free-text `detail`.
 *
 * @example
 * ```typescript
 * import { ErrorSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * const [error, body] = ErrorSchemaObject.safeParse({
 *   detail: 'The requested resource does not exist',
 * });
 * if (!error) {
 *   console.log(body.detail);
 * }
 * ```
 */
export const ErrorSchemaObject: BaseGuardian<ErrorSchema> = Guardian.object({
  /** Human-readable description of what went wrong. */
  detail: Guardian.string(),
  /** Per-field or nested validation messages, present on some 400 responses. */
  causes: Guardian.array(Guardian.string()).optional(),
}).passthrough().describe({
  title: 'Sentry error response',
  description:
    'Documented JSON error envelope ({ detail, causes? }) returned by Sentry on 4xx responses.',
});
