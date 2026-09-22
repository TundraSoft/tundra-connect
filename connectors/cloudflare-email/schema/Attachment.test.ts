import * as asserts from '@asserts';
import { describe, it } from '@test';
import { AttachmentSchemaObject } from './Attachment.ts';

describe('CloudflareEmail.schema.Attachment', () => {
  it('accepts a minimal attachment', () => {
    const [error, attachment] = AttachmentSchemaObject.safeParse({
      content: 'SGVsbG8=',
      filename: 'hello.txt',
      type: 'text/plain',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(attachment?.filename, 'hello.txt');
  });

  it('accepts an explicit disposition', () => {
    const [error, attachment] = AttachmentSchemaObject.safeParse({
      content: 'SGVsbG8=',
      filename: 'logo.png',
      type: 'image/png',
      disposition: 'inline',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(attachment?.disposition, 'inline');
  });

  it('validates content as base64 without decoding it', () => {
    const [error, attachment] = AttachmentSchemaObject.safeParse({
      content: 'SGVsbG8=',
      filename: 'hello.txt',
      type: 'text/plain',
    });
    asserts.assertEquals(error, null);
    // The base64 payload must survive verbatim — decoding here would put
    // raw bytes on the wire and corrupt every attachment.
    asserts.assertEquals(attachment?.content, 'SGVsbG8=');
  });

  it('rejects content that is not base64 — the data: URI mistake', () => {
    asserts.assertExists(
      AttachmentSchemaObject.safeParse({
        content: 'data:text/plain;base64,SGVsbG8=',
        filename: 'hello.txt',
        type: 'text/plain',
      })[0],
    );
  });

  it('rejects an empty filename', () => {
    asserts.assertExists(
      AttachmentSchemaObject.safeParse({
        content: 'SGVsbG8=',
        filename: '',
        type: 'text/plain',
      })[0],
    );
  });

  it('rejects a missing MIME type', () => {
    asserts.assertExists(
      AttachmentSchemaObject.safeParse({
        content: 'SGVsbG8=',
        filename: 'hello.txt',
      })[0],
    );
  });

  it('rejects a non-object value', () => {
    asserts.assertExists(AttachmentSchemaObject.safeParse('SGVsbG8=')[0]);
  });
});
