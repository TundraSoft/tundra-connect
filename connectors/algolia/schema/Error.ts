import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for Algolia's error envelope.
 *
 * Hand-written (rather than derived via `GuardianInfer`) so the exported
 * schema below can carry an explicit `BaseGuardian<ErrorEnvelopeSchema>`
 * annotation with no unannotated intermediate — JSR's "slow types" check
 * requires the originating declaration of any type reachable from the
 * public API to be explicit.
 */
export type ErrorEnvelopeSchema = {
  /** Human-readable vendor error message. */
  message: string;
  /** HTTP status code, echoed inside the body as well as on the response itself. */
  status: number;
};

/**
 * Schema for Algolia's error envelope.
 *
 * Every documented Algolia API error responds with the same flat shape —
 * `{"message":"Invalid Application-ID or API key","status":403}` — so,
 * unlike vendors with several documented error-envelope variants, this
 * connect needs no `oneOf` fallback chain.
 *
 * @example
 * ```typescript
 * import { ErrorEnvelopeSchemaObject } from '@tundraconnect/algolia/schemas';
 *
 * const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
 *   message: 'Invalid Application-ID or API key',
 *   status: 403,
 * });
 * if (!error) {
 *   console.log(envelope.message);
 * }
 * ```
 */
export const ErrorEnvelopeSchemaObject: BaseGuardian<ErrorEnvelopeSchema> =
  Guardian.object({
    /** Human-readable vendor error message. */
    message: Guardian.string(),
    /** HTTP status code, echoed inside the body as well as on the response itself. */
    status: Guardian.number().integer(),
  }).passthrough().describe({
    title: 'Algolia error envelope',
    description:
      "Algolia's documented `{ message, status }` error response body.",
  });
