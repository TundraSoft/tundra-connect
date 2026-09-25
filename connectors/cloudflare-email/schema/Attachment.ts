import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link AttachmentSchemaObject}.
 *
 * Hand-written directly (no `GuardianInfer<typeof _internal>` hop) so each
 * field carries its own JSDoc — see CONVENTIONS.md's "Schemas" section for
 * when either style is appropriate.
 */
export type AttachmentSchema = {
  /** Base64-encoded file content. NOT a data URI — the base64 payload alone. */
  content: string;
  /** File name as it should appear to the recipient, e.g. `invoice.pdf`. */
  filename: string;
  /** MIME type, e.g. `application/pdf`. */
  type: string;
  /**
   * Content-Disposition. `attachment` (the default) offers the file as a
   * download; `inline` renders it in the body, which is what an image
   * referenced by a `cid:` URL in `html` needs.
   */
  disposition?: string;
};

/**
 * Schema for one entry of a send request's `attachments` array.
 *
 * Cloudflare counts attachments against the same 5 MiB total message size
 * as the body, and base64 inflates content by roughly a third — a ~3.7 MiB
 * file is already over the limit once encoded. The API, not this schema,
 * enforces that (it depends on the whole message, not one attachment), and
 * it surfaces as `MESSAGE_TOO_LARGE`.
 *
 * @example
 * ```typescript
 * import { AttachmentSchemaObject } from '@tundraconnect/cloudflare-email/schemas';
 *
 * const [error, attachment] = AttachmentSchemaObject.safeParse({
 *   content: 'SGVsbG8=',
 *   filename: 'hello.txt',
 *   type: 'text/plain',
 * });
 * ```
 */
export const AttachmentSchemaObject: BaseGuardian<AttachmentSchema> = Guardian
  .object({
    // `base64()` rather than a bare `notEmpty()` — the single most common
    // mistake here is passing a `data:` URI or raw bytes, which the API
    // rejects with an opaque schema error well after the fact.
    content: Guardian.string().base64(
      undefined,
      'Attachment content must be base64',
    ),
    filename: Guardian.string().notEmpty('Attachment filename cannot be empty'),
    type: Guardian.string().notEmpty('Attachment MIME type cannot be empty'),
    disposition: Guardian.string().optional(),
  }).describe({
    title: 'Email attachment',
    description:
      'One file attached to a send request: base64 content, filename, MIME type, and optional disposition.',
  });
