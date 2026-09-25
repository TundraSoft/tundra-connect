import * as asserts from '@asserts';
import { describe, it } from '@test';
import { AttachmentSchemaObject } from './Attachment.ts';

describe('SendGrid.schema.Attachment', () => {
  it('accepts a minimal attachment', () => {
    asserts.assertEquals(
      AttachmentSchemaObject.safeParse({
        content: 'aGVsbG8=',
        filename: 'hello.txt',
      })[0],
      null,
    );
  });

  it('accepts a fully populated attachment', () => {
    const [error, attachment] = AttachmentSchemaObject.safeParse({
      content: 'aGVsbG8=',
      filename: 'inline.png',
      type: 'image/png',
      disposition: 'inline',
      content_id: 'logo',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(attachment?.disposition, 'inline');
    asserts.assertEquals(attachment?.content_id, 'logo');
  });

  it('rejects non-base64 content', () => {
    asserts.assertExists(
      AttachmentSchemaObject.safeParse({
        content: 'not base64!!!',
        filename: 'hello.txt',
      })[0],
    );
  });

  it('rejects a missing filename', () => {
    asserts.assertExists(
      AttachmentSchemaObject.safeParse({ content: 'aGVsbG8=' })[0],
    );
  });

  it('rejects an unsupported disposition value', () => {
    asserts.assertExists(
      AttachmentSchemaObject.safeParse({
        content: 'aGVsbG8=',
        filename: 'hello.txt',
        disposition: 'preview',
      })[0],
    );
  });

  it('rejects a malformed MIME type', () => {
    asserts.assertExists(
      AttachmentSchemaObject.safeParse({
        content: 'aGVsbG8=',
        filename: 'hello.txt',
        type: 'not-a-mime-type',
      })[0],
    );
  });
});
