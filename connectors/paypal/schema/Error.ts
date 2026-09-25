import { type BaseGuardian, Guardian } from '@guardian';
import { type LinkSchema, LinkSchemaObject } from './Common.ts';

/**
 * Type definition for one entry of PayPal's error `details` array —
 * PayPal's `error_details` object. Confirmed against PayPal's published
 * OpenAPI spec response examples (`checkout_orders_v2.json`), e.g.
 * `{ issue: "PAYER_ACTION_REQUIRED", description: "..." }` and
 * `{ field: "/purchase_units/@reference_id=='PUHF'/shipping/address",
 * issue: "MISSING_SHIPPING_ADDRESS", description: "..." }`.
 */
export type ErrorDetailSchema = {
  /** JSON-pointer to the request field that caused the error, when applicable. */
  field?: string;
  /** The value of the field that caused the error. */
  value?: string;
  /** Where the offending field was — `body`, `path`, or `query`. Defaults to `body`. */
  location?: string;
  /** The unique, fine-grained application-level error code (e.g. `"PAYER_ACTION_REQUIRED"`) — this connect maps a subset onto its own error codes. */
  issue: string;
  /** Human-readable description of the issue. May change over the API's lifetime — do not depend on this value programmatically. */
  description?: string;
};

const _errorDetailSchema: BaseGuardian<ErrorDetailSchema> = Guardian.object({
  field: Guardian.string().optional(),
  value: Guardian.string().optional(),
  location: Guardian.string().optional(),
  issue: Guardian.string(),
  description: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Error detail',
  description: "One entry of PayPal's error envelope `details` array.",
});

/** Schema for PayPal's `error_details` object. */
export const ErrorDetailSchemaObject: BaseGuardian<ErrorDetailSchema> =
  _errorDetailSchema;

/**
 * Type definition for PayPal's vendor error envelope — `error` object,
 * confirmed against PayPal's published OpenAPI spec
 * (`checkout_orders_v2.json#/components/schemas/error`):
 * `{ name, message, debug_id, details?, links? }`.
 */
export type ErrorEnvelopeSchema = {
  /** Human-readable, unique name of the error (e.g. `"UNPROCESSABLE_ENTITY"`, `"INVALID_REQUEST"`). */
  name: string;
  /** Message that describes the error. */
  message: string;
  /** PayPal-internal ID, for correlating with PayPal support. */
  debug_id: string;
  /** Additional field-level details about the error — see {@link ErrorDetailSchema}. */
  details?: ErrorDetailSchema[];
  /** Request-related HATEOAS links, e.g. an `information_link` to the documented issue. */
  links?: LinkSchema[];
};

const _errorEnvelopeSchema: BaseGuardian<ErrorEnvelopeSchema> = Guardian
  .object({
    name: Guardian.string(),
    message: Guardian.string(),
    debug_id: Guardian.string(),
    details: Guardian.array(ErrorDetailSchemaObject).optional(),
    links: Guardian.array(LinkSchemaObject).optional(),
  }).passthrough().describe({
    title: 'Error envelope',
    description:
      "PayPal's documented error response body, returned on every 4xx/5xx response.",
  });

/** Schema for PayPal's vendor error envelope. */
export const ErrorEnvelopeSchemaObject: BaseGuardian<ErrorEnvelopeSchema> =
  _errorEnvelopeSchema;
