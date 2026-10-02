import { type BaseGuardian, Guardian } from '@guardian';

/** Type definition for {@link GoogleErrorDetailSchemaObject}. */
export type GoogleErrorDetailSchema = {
  /** Protobuf type URL, e.g. `type.googleapis.com/google.rpc.ErrorInfo`. */
  '@type'?: string;
  /** On an `ErrorInfo` detail: the machine-readable cause, e.g. `API_KEY_INVALID`. */
  reason?: string;
};

/**
 * Schema for one entry of a Google error's `details` array. Only the two
 * fields this client reads are modelled; the rest pass through.
 *
 * @example
 * ```typescript
 * import { GoogleErrorDetailSchemaObject } from '@tundraconnect/google-web-risk/schemas';
 *
 * const [error, detail] = GoogleErrorDetailSchemaObject.safeParse({
 *   '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
 *   reason: 'API_KEY_INVALID',
 * });
 * ```
 */
export const GoogleErrorDetailSchemaObject: BaseGuardian<
  GoogleErrorDetailSchema
> = Guardian.object({
  '@type': Guardian.string().optional(),
  reason: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Google error detail',
  description: 'One entry of the `details` array on a Google API error.',
});

/** Type definition for {@link GoogleErrorEnvelopeSchemaObject}. */
export type GoogleErrorEnvelopeSchema = {
  error: {
    /** HTTP status code, repeated in the body. */
    code?: number;
    /** Human-readable message, e.g. `API key not valid. Please pass a valid API key.` */
    message?: string;
    /** Canonical gRPC status name, e.g. `INVALID_ARGUMENT`, `PERMISSION_DENIED`. */
    status?: string;
    /** Structured detail entries; an `ErrorInfo` carries the `reason`. */
    details?: GoogleErrorDetailSchema[];
  };
};

/**
 * Schema for Google's standard API error envelope.
 *
 * Used only to READ a rejection — `GoogleWebRisk.__toError` parses the
 * body with this to recover the message, status and reason, and falls
 * back to HTTP-status mapping when a body doesn't match (a load balancer's
 * HTML 502, say).
 *
 * @example
 * ```typescript
 * import { GoogleErrorEnvelopeSchemaObject } from '@tundraconnect/google-web-risk/schemas';
 *
 * const [error, envelope] = GoogleErrorEnvelopeSchemaObject.safeParse({
 *   error: {
 *     code: 400,
 *     message: 'API key not valid. Please pass a valid API key.',
 *     status: 'INVALID_ARGUMENT',
 *   },
 * });
 * ```
 */
export const GoogleErrorEnvelopeSchemaObject: BaseGuardian<
  GoogleErrorEnvelopeSchema
> = Guardian.object({
  error: Guardian.object({
    code: Guardian.number().optional(),
    message: Guardian.string().optional(),
    status: Guardian.string().optional(),
    details: Guardian.array(GoogleErrorDetailSchemaObject).optional(),
  }).passthrough(),
}).passthrough().describe({
  title: 'Google API error envelope',
  description:
    'The `{ error: { code, message, status, details } }` body Google APIs return on failure.',
});
