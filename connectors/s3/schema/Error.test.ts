import * as asserts from '@asserts';
import { describe, it } from '@test';
import { S3ErrorEnvelopeSchemaObject } from './Error.ts';

describe('S3.schema.Error', () => {
  it('validates the documented four-field envelope', () => {
    const [error, value] = S3ErrorEnvelopeSchemaObject.safeParse({
      Code: 'NoSuchKey',
      Message: 'The specified key does not exist.',
      Resource: '/examplebucket/test.txt',
      RequestId: '4442587FB7D0A2F9',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.Code, 'NoSuchKey');
  });

  it('accepts extra vendor diagnostic fields via passthrough', () => {
    const [error, value] = S3ErrorEnvelopeSchemaObject.safeParse({
      Code: 'AccessDenied',
      Message: 'Access Denied',
      HostId: 'abc123==',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      (value as Record<string, unknown>)?.HostId,
      'abc123==',
    );
  });

  it('rejects an envelope missing the required Code/Message', () => {
    const [error] = S3ErrorEnvelopeSchemaObject.safeParse({
      Message: 'Access Denied',
    });
    asserts.assertExists(error);
  });
});
