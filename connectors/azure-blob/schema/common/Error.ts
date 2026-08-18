import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Shape of the XML `<Error>` envelope Azure Blob Storage returns on every
 * non-2xx response.
 *
 * RESTler auto-parses an `application/xml` body into an object keyed by the
 * root tag name (see `RESTler._parseResponseBody`), so the root `<Error>`
 * element surfaces as the top-level `Error` key here — this schema mirrors
 * that shape verbatim rather than unwrapping it, matching how vendor
 * envelopes are modelled elsewhere in this repo (e.g. OpenExchange's
 * `ErrorSchemaObject`).
 *
 * Written out by hand (rather than derived via `GuardianInfer<typeof
 * ErrorSchemaObject>`) so `ErrorSchemaObject` below can carry an explicit
 * `BaseGuardian<ErrorSchema>` annotation without a circular reference —
 * see `CONVENTIONS.md`'s JSR "slow types" note.
 */
export type ErrorSchema = {
  Error: {
    /** Documented vendor error code, e.g. `BlobNotFound`. */
    Code: string;
    /** Human-readable description, often including a RequestId/Time trailer. */
    Message: string;
  };
};

/**
 * Schema for the XML `<Error>` envelope Azure Blob Storage returns on every
 * non-2xx response.
 *
 * @example
 * ```typescript
 * import { ErrorSchemaObject } from '@tundraconnect/azure-blob/schemas';
 *
 * const [error, envelope] = ErrorSchemaObject.safeParse({
 *   Error: { Code: 'BlobNotFound', Message: 'The specified blob does not exist.' },
 * });
 * if (!error) {
 *   console.log(envelope.Error.Code); // 'BlobNotFound'
 * }
 * ```
 */
export const ErrorSchemaObject: BaseGuardian<ErrorSchema> = Guardian.object({
  Error: Guardian.object({
    /** Documented vendor error code, e.g. `BlobNotFound`. */
    Code: Guardian.string(),
    /** Human-readable description, often including a RequestId/Time trailer. */
    Message: Guardian.string(),
  }),
}).describe({
  title: 'Azure Blob Storage error envelope',
  description:
    'Documented XML <Error> envelope returned by Azure Blob Storage endpoints.',
});
