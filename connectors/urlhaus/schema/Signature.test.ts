import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  SignatureEntrySchemaObject,
  SignatureUrlSchemaObject,
} from './Signature.ts';

describe('URLhaus.schema.Signature', () => {
  it('parses a signature entry', () => {
    const [error, family] = SignatureEntrySchemaObject.safeParse({
      url_count: '10',
      payload_count: '4',
      urls: [{ url_id: '1', md5_hash: 'abc', virustotal: null }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(family?.payload_count, '4');
  });

  it('rejects a urls value that is not an array', () => {
    asserts.assertExists(SignatureEntrySchemaObject.safeParse({ urls: 1 })[0]);
  });

  it('accepts a signature URL with null hashes metadata', () => {
    asserts.assertEquals(
      SignatureUrlSchemaObject.safeParse({ imphash: null, tlsh: null })[0],
      null,
    );
  });
});
