import { type BaseGuardian, Guardian, type ObjectGuardian } from '@guardian';

/**
 * Schema for CoinGecko API error responses
 *
 * CoinGecko's error envelope is genuinely inconsistent across endpoints and
 * status codes — this schema normalizes the three documented shapes into a
 * single `{ error_code?, error_message }` result:
 *
 * - Shape B (structured, tried first): `{ status: { error_code, error_message, timestamp? } }` — seen on 401/429.
 * - Shape C (nested, tried second): `{ error: { status: { error_code, error_message } } }` — seen on some 401s.
 * - Shape A (flat, tried last): `{ error: "<string>" }` — seen on 400/404/422.
 *
 * When none of the three shapes match, `.safeParse()` returns an error and
 * the caller falls back to the raw response body.
 *
 * @example
 * ```typescript
 * import { ErrorEnvelopeSchemaObject } from '@tundraconnect/coingecko/schemas';
 *
 * const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
 *   status: { error_code: 10002, error_message: 'no api key' },
 * });
 * if (!error) {
 *   console.log(envelope.error_message);
 * }
 * ```
 */

/** Vendor status payload embedded in shapes B and C. */
interface _ErrorStatusSchema {
  /** Vendor-documented numeric error code (e.g. 10002, 10005, 10010, 10011). */
  error_code: number;
  /** Human-readable vendor error message. */
  error_message: string;
  /** Optional vendor timestamp. */
  timestamp?: string;
}

const ErrorStatusSchemaObject: BaseGuardian<_ErrorStatusSchema> = Guardian
  .object({
    /** Vendor-documented numeric error code (e.g. 10002, 10005, 10010, 10011). */
    error_code: Guardian.number(),
    /** Human-readable vendor error message. */
    error_message: Guardian.string(),
    /** Optional vendor timestamp. */
    timestamp: Guardian.string().optional(),
  });

// The three envelope-shape branches below are typed `ObjectGuardian<In, Out>`
// (rather than the narrower `BaseGuardian<Out>`) because they're passed as
// a set to `Guardian.oneOf()` below — TypeScript needs each branch's
// concrete `ObjectGuardian` generic (not just the erased `BaseGuardian`
// base) to keep the resulting union's members distinguishable; erasing to
// `BaseGuardian` collapses the inferred union to the branches' common
// properties (dropping `error_code`) instead of the full A | B | C union.

/** Normalized `{ error_code, error_message }` shared by shapes B and C. */
export type ErrorEnvelopeCodedSchema = {
  error_code: number;
  error_message: string;
};

/** Shape B: `{ status: { error_code, error_message, timestamp? } }`. */
type _ErrorEnvelopeStatusInput = {
  status: _ErrorStatusSchema;
};

const ErrorEnvelopeStatusSchemaObject: ObjectGuardian<
  _ErrorEnvelopeStatusInput,
  ErrorEnvelopeCodedSchema
> = Guardian.object({
  status: ErrorStatusSchemaObject,
}).transform((data) => ({
  error_code: data.status.error_code,
  error_message: data.status.error_message,
}));

/** Shape C: `{ error: { status: { error_code, error_message } } }`. */
type _ErrorEnvelopeNestedInput = {
  error: {
    status: _ErrorStatusSchema;
  };
};

const ErrorEnvelopeNestedSchemaObject: ObjectGuardian<
  _ErrorEnvelopeNestedInput,
  ErrorEnvelopeCodedSchema
> = Guardian.object({
  error: Guardian.object({
    status: ErrorStatusSchemaObject,
  }),
}).transform((data) => ({
  error_code: data.error.status.error_code,
  error_message: data.error.status.error_message,
}));

/** Shape A: `{ error: "<string>" }`. */
type _ErrorEnvelopeFlatInput = {
  error: string;
};

/** Normalized `{ error_message }` produced by shape A. */
export type ErrorEnvelopeFlatSchema = {
  error_message: string;
};

const ErrorEnvelopeFlatSchemaObject: ObjectGuardian<
  _ErrorEnvelopeFlatInput,
  ErrorEnvelopeFlatSchema
> = Guardian.object({
  error: Guardian.string(),
}).transform((data) => ({
  error_message: data.error,
}));

/** Type definition for the normalized CoinGecko error envelope. */
export type ErrorEnvelopeSchema =
  | ErrorEnvelopeCodedSchema
  | ErrorEnvelopeFlatSchema;

/**
 * Normalized CoinGecko error envelope — tries shape B, then shape C, then
 * shape A, in that order, and yields `{ error_code?, error_message }`.
 */
export const ErrorEnvelopeSchemaObject: BaseGuardian<ErrorEnvelopeSchema> =
  Guardian.oneOf(
    [
      ErrorEnvelopeStatusSchemaObject,
      ErrorEnvelopeNestedSchemaObject,
      ErrorEnvelopeFlatSchemaObject,
    ],
    'Response body did not match any documented CoinGecko error envelope.',
  );
