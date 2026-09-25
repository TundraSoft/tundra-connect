import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for one GCS error detail entry.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * ErrorDetailSchemaObject>`) and kept in sync with the field list below:
 * JSR's "slow types" check requires every exported symbol's type to be
 * resolvable without inferring through a generic builder chain, and a type
 * derived from `typeof` an *inferred* (unannotated) `Guardian.object(...)`
 * result still counts as such a chain even when the derivation itself is a
 * one-line alias — see `ErrorDetailSchemaObject`'s explicit annotation
 * below, which is what actually satisfies the check.
 */
export type ErrorDetailSchema = {
  /** Broad error category (e.g. `global`, `usageLimits`). */
  domain?: string;
  /** Specific machine-readable reason — see the vendor status-codes doc. */
  reason?: string;
  /** Human-readable description of this specific error. */
  message?: string;
  /** What kind of location caused the error (`parameter`, `header`, ...). */
  locationType?: string;
  /** The location (parameter/header name) that caused the error. */
  location?: string;
};

/**
 * Schema for one entry of a GCS error envelope's `errors` array
 *
 * @see https://cloud.google.com/storage/docs/json_api/v1/status-codes
 */
export const ErrorDetailSchemaObject: BaseGuardian<ErrorDetailSchema> = Guardian
  .object({
    domain: Guardian.string().optional(),
    reason: Guardian.string().optional(),
    message: Guardian.string().optional(),
    locationType: Guardian.string().optional(),
    location: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'GCS error detail',
    description: "One entry of a GCS error envelope's `error.errors` array.",
  });

/**
 * Type definition for a GCS error envelope.
 *
 * Hand-written for the same "slow types" reason as {@link ErrorDetailSchema}
 * — see that type's doc comment.
 */
export type ErrorEnvelopeSchema = {
  error: {
    /** HTTP status code, duplicated inside the body. */
    code: number;
    /** Human-readable summary of the error. */
    message: string;
    /** Zero or more granular error details. */
    errors?: ErrorDetailSchema[];
  };
};

/**
 * Schema for the GCS JSON API's error envelope
 *
 * Every documented GCS error response body has this shape:
 * `{ error: { code, message, errors: [...] } }`. `errors` can carry
 * multiple entries — the connect keys its error mapping off
 * `error.errors[0].reason`, falling back to `error.code`/`error.message`
 * when `errors` is absent.
 *
 * @example
 * ```typescript
 * const body = {
 *   error: {
 *     code: 404,
 *     message: 'Not Found',
 *     errors: [{ domain: 'global', reason: 'notFound', message: 'Not Found' }],
 *   },
 * };
 *
 * const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse(body);
 * if (!error) {
 *   console.log(envelope.error.errors?.[0]?.reason); // 'notFound'
 * }
 * ```
 */
export const ErrorEnvelopeSchemaObject: BaseGuardian<ErrorEnvelopeSchema> =
  Guardian.object({
    error: Guardian.object({
      code: Guardian.number(),
      message: Guardian.string(),
      errors: Guardian.array(ErrorDetailSchemaObject).optional(),
    }).passthrough(),
  }).describe({
    title: 'GCS error envelope',
    description: 'The documented `{ error: {...} }` envelope returned by GCS.',
  });
