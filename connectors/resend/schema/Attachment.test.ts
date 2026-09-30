import * as asserts from '@asserts';
import { describe, it } from '@test';
import { AttachmentSchemaObject } from './Attachment.ts';

describe('Resend.schema.Attachment', () => {
  it('accepts base64 content with metadata', () => {
    const [error, value] = AttachmentSchemaObject.safeParse({
      content: 'SGVsbG8=',
      filename: 'hello.txt',
      content_type: 'text/plain',
      content_id: 'logo',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.content_id, 'logo');
  });

  it('accepts a remote path on its own', () => {
    const [error] = AttachmentSchemaObject.safeParse({
      path: 'https://example.com/invoice.pdf',
    });
    asserts.assertEquals(error, null);
  });

  it('rejects neither content nor path', () => {
    const [error] = AttachmentSchemaObject.safeParse({ filename: 'a.txt' });
    asserts.assertStringIncludes(error!.message, '`content` or `path`');
  });

  it('rejects both content and path', () => {
    const [error] = AttachmentSchemaObject.safeParse({
      content: 'SGVsbG8=',
      path: 'https://example.com/a.txt',
    });
    asserts.assertExists(error);
  });

  it('rejects a data: URI as content', () => {
    const [error] = AttachmentSchemaObject.safeParse({
      content: 'data:text/plain;base64,SGVsbG8=',
    });
    asserts.assertExists(error);
  });

  it('rejects a path that is not a URL', () => {
    const [error] = AttachmentSchemaObject.safeParse({ path: 'invoice.pdf' });
    asserts.assertExists(error);
  });
});
