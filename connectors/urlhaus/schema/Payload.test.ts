import * as asserts from '@asserts';
import { describe, it } from '@test';
import { PayloadEntrySchemaObject, PayloadUrlSchemaObject } from './Payload.ts';

describe('URLhaus.schema.Payload', () => {
  it('parses a documented payload entry', () => {
    const [error, payload] = PayloadEntrySchemaObject.safeParse({
      md5_hash: '1585ad28f7d1e0ca696e6c6c2f1d008a',
      file_size: '241664',
      signature: 'Heodo',
      lastseen: '2019-01-19 14:48:08',
      virustotal: { result: '17 / 69', percent: '24.64', link: 'https://x' },
      urls: [{ url_id: '105243', lastseen: null }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(payload?.urls?.[0]?.url_id, '105243');
  });

  it('accepts a recent-feed payload without urls', () => {
    asserts.assertEquals(
      PayloadEntrySchemaObject.safeParse({ sha256_hash: 'abc' })[0],
      null,
    );
  });

  it('rejects a virustotal value that is not an object or null', () => {
    asserts.assertExists(
      PayloadEntrySchemaObject.safeParse({ virustotal: 'n/a' })[0],
    );
  });

  it('accepts a payload URL with null filename and lastseen', () => {
    asserts.assertEquals(
      PayloadUrlSchemaObject.safeParse({ filename: null, lastseen: null })[0],
      null,
    );
  });
});
