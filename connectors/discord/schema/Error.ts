import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for the Discord error envelope.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * ErrorSchemaObject>`) so the exported schema below can carry an explicit
 * `BaseGuardian<ErrorSchema>` annotation without a circular reference —
 * JSR's "slow types" check requires the originating declaration of any type
 * reachable from the public API to be explicit.
 */
export type ErrorSchema = {
  /** Discord's numeric JSON error code (e.g. `50006`); `0` is the generic/general error. */
  code: number;
  /** Human-readable error description. */
  message: string;
  /**
   * Nested per-field validation errors, present on `50035` ("Invalid Form
   * Body") responses. Shape is a recursive tree of `{ _errors: [...] }`
   * nodes keyed by field path/index, so it is intentionally left
   * unvalidated here rather than modelled field-by-field.
   */
  errors?: Record<string, unknown>;
};

/**
 * Schema for Discord's standard JSON error envelope, returned on non-2xx
 * responses from both the webhook and the bot REST API.
 *
 * @example
 * ```typescript
 * import { ErrorSchemaObject } from '@tundraconnect/discord/schemas';
 *
 * const errorResponse = { code: 50006, message: 'Cannot send an empty message' };
 * const [error, validated] = ErrorSchemaObject.safeParse(errorResponse);
 * if (!error) {
 *   console.log(`Discord error ${validated.code}: ${validated.message}`);
 * }
 * ```
 */
export const ErrorSchemaObject: BaseGuardian<ErrorSchema> = Guardian.object({
  /** Discord's numeric JSON error code (e.g. `50006`); `0` is the generic/general error. */
  code: Guardian.number(),
  /** Human-readable error description. */
  message: Guardian.string(),
  /**
   * Nested per-field validation errors, present on `50035` ("Invalid Form
   * Body") responses. Shape is a recursive tree of `{ _errors: [...] }`
   * nodes keyed by field path/index, so it is intentionally left
   * unvalidated here rather than modelled field-by-field.
   */
  errors: Guardian.record(Guardian.unknown()).optional(),
}).passthrough().describe({
  title: 'Discord error response',
  description:
    'Documented JSON error envelope returned by Discord endpoints on non-2xx responses.',
});

/**
 * Type definition for the Discord rate limit response body.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * RateLimitSchemaObject>`) so the exported schema below can carry an
 * explicit `BaseGuardian<RateLimitSchema>` annotation without a circular
 * reference — JSR's "slow types" check requires the originating declaration
 * of any type reachable from the public API to be explicit.
 */
export type RateLimitSchema = {
  /** Human-readable rate-limit message. */
  message: string;
  /** Seconds to wait before submitting another request. */
  retry_after: number;
  /** Whether this is a global rate limit rather than a per-route one. */
  global: boolean;
  /** Present for some limit types (e.g. shared resource limits). */
  code?: number;
};

/**
 * Schema for the JSON body of a `429 Too Many Requests` response. Distinct
 * from {@link ErrorSchemaObject}: `code` is not always present, and
 * `retry_after`/`global` are rate-limit-specific.
 *
 * @example
 * ```typescript
 * import { RateLimitSchemaObject } from '@tundraconnect/discord/schemas';
 *
 * const [error, limit] = RateLimitSchemaObject.safeParse({
 *   message: 'You are being rate limited.',
 *   retry_after: 0.65,
 *   global: false,
 * });
 * if (!error) {
 *   console.log(`Retry after ${limit.retry_after}s`);
 * }
 * ```
 */
export const RateLimitSchemaObject: BaseGuardian<RateLimitSchema> = Guardian
  .object({
    /** Human-readable rate-limit message. */
    message: Guardian.string(),
    /** Seconds to wait before submitting another request. */
    retry_after: Guardian.number(),
    /** Whether this is a global rate limit rather than a per-route one. */
    global: Guardian.boolean(),
    /** Present for some limit types (e.g. shared resource limits). */
    code: Guardian.number().optional(),
  }).passthrough().describe({
    title: 'Discord rate limit response',
    description: 'JSON body returned alongside a 429 response.',
  });
