import { type BaseGuardian, Guardian } from '@guardian';

/** Type definition for a SendGrid mail-send attachment. */
export interface AttachmentSchema {
  /** Base64-encoded attachment content. */
  content: string;
  /** Filename shown to the recipient. */
  filename: string;
  /** MIME type of the attachment (e.g. `text/plain`). */
  type?: string;
  /** Whether the attachment renders inline or as a separate file. */
  disposition?: 'inline' | 'attachment';
  /** Content id used to reference an `inline` attachment from HTML content. */
  content_id?: string;
}

/**
 * Schema for a SendGrid mail-send attachment
 *
 * Validates one entry of the `attachments` array on a mail-send request —
 * base64-encoded file content plus its filename, MIME type, disposition,
 * and optional content id (for inline images referenced from HTML content).
 *
 * @example
 * ```typescript
 * import { AttachmentSchemaObject } from '@tundraconnect/sendgrid/schemas';
 *
 * const [error, attachment] = AttachmentSchemaObject.safeParse({
 *   content: 'aGVsbG8gd29ybGQ=',
 *   filename: 'hello.txt',
 *   type: 'text/plain',
 *   disposition: 'attachment',
 * });
 * if (!error) {
 *   console.log(attachment.filename);
 * }
 * ```
 */
export const AttachmentSchemaObject: BaseGuardian<AttachmentSchema> = Guardian
  .object({
    /** Base64-encoded attachment content. */
    content: Guardian.string().base64().minLength(1),
    /** Filename shown to the recipient. */
    filename: Guardian.string().minLength(1),
    /** MIME type of the attachment (e.g. `text/plain`). */
    type: Guardian.string().mimeType().optional(),
    /** Whether the attachment renders inline or as a separate file. */
    disposition: Guardian.enum(['inline', 'attachment'] as const).optional(),
    /** Content id used to reference an `inline` attachment from HTML content. */
    content_id: Guardian.string().optional(),
  }).describe({
    title: 'Attachment',
    description: 'A base64-encoded file attached to an outbound message.',
  });
