import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Schema for the `error` object nested inside Razorpay's error envelope
 * (https://razorpay.com/docs/api/errors/, https://razorpay.com/docs/errors/).
 *
 * Only `code` and `description` are guaranteed present; `field`, `source`,
 * `step`, `reason`, and `metadata` are documented as situational —
 * populated when Razorpay can attribute the failure to a specific request
 * field or a specific stage of processing. `.passthrough()` keeps any
 * additional undocumented field reachable rather than dropping it.
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived): JSR's
 * public-API "slow types" check requires the *originating* declaration of
 * any type reachable from the public API to carry an explicit annotation,
 * including a private `const` reached only via `typeof` — so the shape is
 * pinned directly here instead of threaded through an internal helper.
 */
export type RazorpayErrorDetailSchema = {
  /** Top-level vendor error code, e.g. `BAD_REQUEST_ERROR`, `GATEWAY_ERROR`, `SERVER_ERROR`. */
  code: string;
  /** Human-readable description of the error. */
  description: string;
  /** Request field that caused the error, when attributable. */
  field?: string | null;
  /** Origin of the failure (`business`/`customer`/`internal`), when applicable. */
  source?: string | null;
  /** Processing step at which the failure occurred, when applicable. */
  step?: string | null;
  /** Vendor-documented reason code for the failure, when applicable. */
  reason?: string | null;
  /** Additional diagnostic key/value pairs, when supplied. */
  metadata?: Record<string, unknown> | null;
};

/** The `error` object nested inside Razorpay's error envelope. */
export const RazorpayErrorDetailSchemaObject: BaseGuardian<
  RazorpayErrorDetailSchema
> = Guardian.object({
  code: Guardian.string(),
  description: Guardian.string(),
  field: Guardian.string().nullable().optional(),
  source: Guardian.string().nullable().optional(),
  step: Guardian.string().nullable().optional(),
  reason: Guardian.string().nullable().optional(),
  metadata: Guardian.object().passthrough().nullable().optional(),
}).passthrough().describe({
  title: 'Razorpay error detail',
  description: "The `error` object nested inside Razorpay's error envelope.",
});

/**
 * Schema for Razorpay's top-level API error envelope (`{ error: {...} }`),
 * returned on non-2xx responses.
 *
 * @example
 * ```typescript
 * import { RazorpayErrorEnvelopeSchemaObject } from '@tundraconnect/razorpay/schemas';
 *
 * const errorResponse = {
 *   error: {
 *     code: 'BAD_REQUEST_ERROR',
 *     description: 'The amount must be at least INR 1.00',
 *     field: 'amount',
 *     source: 'business',
 *     step: 'payment_initiation',
 *     reason: 'input_validation_failed',
 *   },
 * };
 *
 * const [error, validated] = RazorpayErrorEnvelopeSchemaObject.safeParse(errorResponse);
 * if (!error) {
 *   console.log(`Razorpay error: ${validated.error.description}`);
 * }
 * ```
 */
export type RazorpayErrorEnvelopeSchema = {
  error: RazorpayErrorDetailSchema;
};

/** Documented error envelope returned by Razorpay on non-2xx responses. */
export const RazorpayErrorEnvelopeSchemaObject: BaseGuardian<
  RazorpayErrorEnvelopeSchema
> = Guardian.object({
  error: RazorpayErrorDetailSchemaObject,
}).describe({
  title: 'Razorpay error response',
  description:
    'Documented error envelope returned by Razorpay on non-2xx responses.',
});
