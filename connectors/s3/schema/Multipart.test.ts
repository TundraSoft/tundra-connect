import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CompleteMultipartUploadResultSchemaObject,
  InitiateMultipartUploadResultSchemaObject,
} from './Multipart.ts';

describe('InitiateMultipartUploadResultSchemaObject', () => {
  it('maps the XML element names to camelCase', () => {
    const [error, result] = InitiateMultipartUploadResultSchemaObject.safeParse(
      { Bucket: 'b', Key: 'k', UploadId: 'abc' },
    );
    asserts.assertEquals(error, null);
    asserts.assertEquals(result, { bucket: 'b', key: 'k', uploadId: 'abc' });
  });

  it('ignores the xmlns attribute the parser surfaces as "@xmlns"', () => {
    const [error, result] = InitiateMultipartUploadResultSchemaObject.safeParse(
      {
        '@xmlns': 'http://s3.amazonaws.com/doc/2006-03-01/',
        Bucket: 'b',
        Key: 'k',
        UploadId: 'abc',
      },
    );
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.uploadId, 'abc');
  });

  it('rejects an empty UploadId', () => {
    const [error] = InitiateMultipartUploadResultSchemaObject.safeParse({
      Bucket: 'b',
      Key: 'k',
      UploadId: '',
    });
    asserts.assertExists(error);
  });
});

describe('CompleteMultipartUploadResultSchemaObject', () => {
  it('accepts the documented shape, Location optional', () => {
    const [error, result] = CompleteMultipartUploadResultSchemaObject.safeParse(
      {
        Location: 'https://b.s3.us-east-1.amazonaws.com/k',
        Bucket: 'b',
        Key: 'k',
        ETag: '"3858f62230ac3c915f300c664312c11f-9"',
      },
    );
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.etag, '"3858f62230ac3c915f300c664312c11f-9"');
    asserts.assertEquals(
      result?.location,
      'https://b.s3.us-east-1.amazonaws.com/k',
    );

    const [error2, result2] = CompleteMultipartUploadResultSchemaObject
      .safeParse({ Bucket: 'b', Key: 'k', ETag: '"x"' });
    asserts.assertEquals(error2, null);
    asserts.assertEquals(result2?.location, undefined);
  });

  it('rejects a result with no ETag', () => {
    const [error] = CompleteMultipartUploadResultSchemaObject.safeParse({
      Bucket: 'b',
      Key: 'k',
    });
    asserts.assertExists(error);
  });
});
