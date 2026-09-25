import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Schema for S3's documented XML error envelope
 *
 * S3 error responses are an `<Error>` document:
 * `<Error><Code>NoSuchKey</Code><Message>...</Message><Resource>.../</Resource><RequestId>...</RequestId></Error>`.
 * RESTler's bundled XML parser turns this into
 * `{ Error: { Code, Message, Resource?, RequestId?, ... } }` — this schema
 * validates the inner `Error` object. `.passthrough()` because S3
 * sometimes adds extra diagnostic fields (`HostId`, `ArgumentName`,
 * `ArgumentValue`, ...) beyond the four always documented.
 *
 * Not every failure carries this body — a HEAD request's error response
 * has no body at all (see {@link S3.ts}'s `headObject`), so callers must
 * treat a missing/unparseable envelope as expected, not a bug.
 *
 * @example
 * ```typescript
 * const errorBody = {
 *   Code: 'NoSuchKey',
 *   Message: 'The specified key does not exist.',
 *   Resource: '/examplebucket/test.txt',
 *   RequestId: '4442587FB7D0A2F9',
 * };
 *
 * const [error, envelope] = S3ErrorEnvelopeSchemaObject.safeParse(errorBody);
 * if (!error) {
 *   console.log(`S3 error: ${envelope.Code}`);
 * }
 * ```
 */
export type S3ErrorEnvelopeSchema = {
  Code: string;
  Message: string;
  Resource?: string;
  RequestId?: string;
};

const _s3ErrorEnvelopeSchema: BaseGuardian<S3ErrorEnvelopeSchema> = Guardian
  .object({
    /** Vendor error code, e.g. `NoSuchKey`, `AccessDenied`. */
    Code: Guardian.string(),
    /** Human-readable description of the error. */
    Message: Guardian.string(),
    /** Path of the resource involved, when documented. */
    Resource: Guardian.string().optional(),
    /** S3 request id, useful when contacting AWS support. */
    RequestId: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'S3 error envelope',
    description: 'Documented `<Error>` XML envelope returned by S3 endpoints.',
  });

/** Guardian schema that validates a {@link S3ErrorEnvelopeSchema}. */
export const S3ErrorEnvelopeSchemaObject: BaseGuardian<S3ErrorEnvelopeSchema> =
  _s3ErrorEnvelopeSchema;
