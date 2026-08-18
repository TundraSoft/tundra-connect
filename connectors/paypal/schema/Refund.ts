import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';
import {
  type LinkSchema,
  LinkSchemaObject,
  type MoneySchema,
  MoneySchemaObject,
} from './Common.ts';

/**
 * Type definition for `refundCapture`'s request body
 * (`POST /v2/payments/captures/{capture_id}/refund`).
 *
 * Scoped to `amount`/`note_to_payer` per this connect's v1 brief — PayPal
 * also documents `invoice_id` and `payment_instruction` on a refund
 * request, which are not modeled here. Omitting `amount` entirely issues
 * a full refund of the capture.
 */
type _RefundRequestShape = {
  /** Amount to refund. Omit for a full refund of the capture. */
  amount?: MoneySchema;
  /** Reason for the refund — shown to the payer in their transaction history and refund email. */
  note_to_payer?: string;
};

const _refundRequestSchema: BaseGuardian<_RefundRequestShape> = Guardian
  .object({
    amount: MoneySchemaObject.optional(),
    note_to_payer: Guardian.string().maxLength(255).optional(),
  }).describe({
    title: 'Refund capture request',
    description:
      'Request body for POST /v2/payments/captures/{capture_id}/refund, validated before the API call. Omit `amount` for a full refund.',
  });

/** Type definition for {@link RefundRequestSchemaObject}. */
export type RefundRequestSchema = GuardianInfer<typeof _refundRequestSchema>;

/** Schema for the `refundCapture` request body. */
export const RefundRequestSchemaObject: BaseGuardian<RefundRequestSchema> =
  _refundRequestSchema;

/** PayPal's documented `refund_status` enum values. */
type _RefundStatus = 'CANCELLED' | 'FAILED' | 'PENDING' | 'COMPLETED';

/**
 * Type definition for `refundCapture`'s response body — PayPal's `refund`
 * object.
 */
type _RefundShape = {
  /** PayPal-generated ID for the refund. */
  id: string;
  /** Status of the refund. */
  status: _RefundStatus;
  /** Amount that was refunded to the payer. */
  amount?: MoneySchema;
  /** Reason for the refund, as supplied on the request. */
  note_to_payer?: string;
  /** Request-related HATEOAS links. */
  links?: LinkSchema[];
};

const _refundSchema: BaseGuardian<_RefundShape> = Guardian.object({
  id: Guardian.string(),
  status: Guardian.enum(
    ['CANCELLED', 'FAILED', 'PENDING', 'COMPLETED'] as const,
  ),
  amount: MoneySchemaObject.optional(),
  note_to_payer: Guardian.string().optional(),
  links: Guardian.array(LinkSchemaObject).optional(),
}).passthrough().describe({
  title: 'Refund',
  description: 'A refund of a captured payment.',
});

/** Type definition for {@link RefundSchemaObject}. */
export type RefundSchema = GuardianInfer<typeof _refundSchema>;

/** Schema for PayPal's `refund` object. */
export const RefundSchemaObject: BaseGuardian<RefundSchema> = _refundSchema;
