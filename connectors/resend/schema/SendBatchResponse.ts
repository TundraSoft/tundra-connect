import { type BaseGuardian, Guardian } from '@guardian';
import { type EmailRefSchema, EmailRefSchemaObject } from './EmailRef.ts';

/** Type definition for {@link SendBatchResponseSchemaObject}. */
export type SendBatchResponseSchema = {
  /** One reference per email, in request order. */
  data: EmailRefSchema[];
};

/**
 * Schema for the `POST /emails/batch` response.
 *
 * `data[i]` is the id of the email at index `i` of the request. A batch is
 * all-or-nothing: if any email fails validation Resend rejects the whole
 * request and nothing is sent.
 *
 * @example
 * ```typescript
 * import { SendBatchResponseSchemaObject } from '@tundraconnect/resend/schemas';
 *
 * const [error, result] = SendBatchResponseSchemaObject.safeParse({
 *   data: [{ id: 'ae2014de-c168-4c61-8267-70d2662a1ce1' }],
 * });
 * ```
 */
export const SendBatchResponseSchemaObject: BaseGuardian<
  SendBatchResponseSchema
> = Guardian.object({
  data: Guardian.array(EmailRefSchemaObject),
}).passthrough().describe({
  title: 'Batch send response',
  description: 'Ids of the emails a batch send created, in request order.',
});
