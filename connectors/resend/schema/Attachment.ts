import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link AttachmentSchemaObject}.
 *
 * Exactly one of `content` / `path` must be supplied — Resend either takes
 * the bytes inline or fetches them from a URL itself.
 */
export type AttachmentSchema = {
  /** Base64-encoded file content. NOT a data URI — the base64 payload alone. */
  content?: string;
  /** Publicly reachable URL Resend downloads the attachment from. */
  path?: string;
  /** File name as it should appear to the recipient, e.g. `invoice.pdf`. */
  filename?: string;
  /** MIME type. Resend derives it from `filename` when omitted. */
  content_type?: string;
  /**
   * Content-ID for an inline image — reference it from `html` as
   * `<img src="cid:<content_id>">`.
   */
  content_id?: string;
};

const _attachment = Guardian.object({
  // `base64()` rather than a bare string — the most common mistake is
  // passing a `data:` URI, which Resend rejects well after the fact.
  content: Guardian.string().base64(
    undefined,
    'Attachment content must be base64',
  ).optional(),
  path: Guardian.string().url('Attachment path must be a URL').optional(),
  filename: Guardian.string().notEmpty('Attachment filename cannot be empty')
    .optional(),
  content_type: Guardian.string().notEmpty(
    'Attachment content_type cannot be empty',
  ).optional(),
  content_id: Guardian.string().notEmpty(
    'Attachment content_id cannot be empty',
  )
    .optional(),
});

/** Resend's `invalid_attachment` rule, checked locally: `content` XOR `path`. */
function hasExactlyOneSource(value: AttachmentSchema): boolean {
  return (value.content !== undefined) !== (value.path !== undefined);
}

/**
 * Schema for one entry of a send request's `attachments` array.
 *
 * Resend caps the whole email at 40 MB after base64 encoding. That limit
 * depends on the entire message, so the API — not this schema — enforces
 * it. Attachments are not supported on batch sends.
 *
 * @example
 * ```typescript
 * import { AttachmentSchemaObject } from '@tundraconnect/resend/schemas';
 *
 * const [error, attachment] = AttachmentSchemaObject.safeParse({
 *   content: 'SGVsbG8=',
 *   filename: 'hello.txt',
 * });
 * ```
 */
export const AttachmentSchemaObject: BaseGuardian<AttachmentSchema> =
  _attachment.test(
    hasExactlyOneSource,
    'Attachment must have exactly one of `content` or `path`',
  ).describe({
    title: 'Email attachment',
    description:
      'One file attached to a send request: base64 `content` or a remote `path`, plus optional filename, MIME type and inline content id.',
  });
