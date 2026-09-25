import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  buildStringToSign,
  payloadByteLength,
  signSharedKey,
} from './AzureBlobSigner.ts';

// Azurite's public, non-secret well-known emulator account/key — see
// https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite#well-known-storage-account-and-key
const ACCOUNT = 'devstoreaccount1';
const ACCOUNT_KEY =
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
const DATE = 'Tue, 01 Jan 2019 12:00:00 GMT';
const VERSION = '2021-08-06';

describe('AzureBlobSigner', () => {
  describe('Case A — HEAD-family (GET/HEAD, body-less)', () => {
    const expectedStringToSign = 'GET\n\n\n\n\n\n\n\n\n\n\n\n' +
      'x-ms-date:Tue, 01 Jan 2019 12:00:00 GMT\n' +
      'x-ms-version:2021-08-06\n' +
      '/devstoreaccount1/mycontainer/myblob.txt';
    const expectedAuthorization =
      'SharedKey devstoreaccount1:WLgaSYe6D+r8bd7PJd9YaH8YqFbSffvhfCZCBXCW1GI=';

    it('produces the exact documented StringToSign for GET', () => {
      const stringToSign = buildStringToSign({
        method: 'GET',
        path: '/mycontainer/myblob.txt',
        account: ACCOUNT,
        accountKey: ACCOUNT_KEY,
        contentLength: 0,
        headers: {
          'x-ms-date': DATE,
          'x-ms-version': VERSION,
        },
      });
      asserts.assertEquals(stringToSign, expectedStringToSign);
    });

    it('signs identically for HEAD — only the VERB field differs', () => {
      const stringToSign = buildStringToSign({
        method: 'HEAD',
        path: '/mycontainer/myblob.txt',
        account: ACCOUNT,
        accountKey: ACCOUNT_KEY,
        contentLength: 0,
        headers: {
          'x-ms-date': DATE,
          'x-ms-version': VERSION,
        },
      });
      asserts.assertEquals(
        stringToSign,
        expectedStringToSign.replace(/^GET/, 'HEAD'),
      );
    });

    it('produces the exact documented Authorization header', async () => {
      const result = await signSharedKey({
        method: 'GET',
        path: '/mycontainer/myblob.txt',
        account: ACCOUNT,
        accountKey: ACCOUNT_KEY,
        contentLength: 0,
        headers: {
          'x-ms-date': DATE,
          'x-ms-version': VERSION,
        },
      });
      asserts.assertEquals(result.stringToSign, expectedStringToSign);
      asserts.assertEquals(result.authorizationHeader, expectedAuthorization);
    });
  });

  describe('Case B — PUT with body + metadata', () => {
    const expectedStringToSign =
      'PUT\n\n\n11\n\ntext/plain; charset=UTF-8\n\n\n\n\n\n\n' +
      'x-ms-blob-type:BlockBlob\n' +
      'x-ms-date:Tue, 01 Jan 2019 12:00:00 GMT\n' +
      'x-ms-meta-m1:v1\n' +
      'x-ms-meta-m2:v2\n' +
      'x-ms-version:2021-08-06\n' +
      '/devstoreaccount1/mycontainer/myblob.txt';
    const expectedAuthorization =
      'SharedKey devstoreaccount1:6ycTBywf1tnra33TJoteskWelMHmTwCWLjIBEi1szjI=';

    it('produces the exact documented StringToSign', () => {
      const stringToSign = buildStringToSign({
        method: 'PUT',
        path: '/mycontainer/myblob.txt',
        account: ACCOUNT,
        accountKey: ACCOUNT_KEY,
        contentLength: 11,
        headers: {
          'Content-Type': 'text/plain; charset=UTF-8',
          'x-ms-meta-m1': 'v1',
          'x-ms-meta-m2': 'v2',
          'x-ms-blob-type': 'BlockBlob',
          'x-ms-date': DATE,
          'x-ms-version': VERSION,
        },
      });
      asserts.assertEquals(stringToSign, expectedStringToSign);
    });

    it('produces the exact documented Authorization header', async () => {
      const result = await signSharedKey({
        method: 'PUT',
        path: '/mycontainer/myblob.txt',
        account: ACCOUNT,
        accountKey: ACCOUNT_KEY,
        contentLength: 11,
        headers: {
          'Content-Type': 'text/plain; charset=UTF-8',
          'x-ms-meta-m1': 'v1',
          'x-ms-meta-m2': 'v2',
          'x-ms-blob-type': 'BlockBlob',
          'x-ms-date': DATE,
          'x-ms-version': VERSION,
        },
      });
      asserts.assertEquals(result.stringToSign, expectedStringToSign);
      asserts.assertEquals(result.authorizationHeader, expectedAuthorization);
    });

    it('is unaffected by the order headers are supplied in', () => {
      const stringToSign = buildStringToSign({
        method: 'PUT',
        path: '/mycontainer/myblob.txt',
        account: ACCOUNT,
        accountKey: ACCOUNT_KEY,
        contentLength: 11,
        headers: {
          'x-ms-version': VERSION,
          'x-ms-date': DATE,
          'x-ms-meta-m2': 'v2',
          'x-ms-blob-type': 'BlockBlob',
          'x-ms-meta-m1': 'v1',
          'Content-Type': 'text/plain; charset=UTF-8',
        },
      });
      asserts.assertEquals(stringToSign, expectedStringToSign);
    });
  });

  describe('CanonicalizedResource — query parameters', () => {
    it('matches the documented List Blobs example', () => {
      // https://learn.microsoft.com/en-us/rest/api/storageservices/authorize-with-shared-key
      // GET https://myaccount.blob.core.windows.net/mycontainer?restype=container&comp=list
      // => CanonicalizedResource: /myaccount/mycontainer\ncomp:list\nrestype:container
      const stringToSign = buildStringToSign({
        method: 'GET',
        path: '/mycontainer',
        account: 'myaccount',
        accountKey: ACCOUNT_KEY,
        contentLength: 0,
        query: { restype: 'container', comp: 'list' },
      });
      asserts.assert(
        stringToSign.endsWith(
          '/myaccount/mycontainer\ncomp:list\nrestype:container',
        ),
      );
    });

    it('lower-cases param names and sorts ascending, using raw values as-is', () => {
      // `query` values are documented as already raw/decoded (the same
      // shape `RESTlerEndpoint.query` expects) — this uses a genuinely raw
      // value (a literal space) rather than a pre-encoded one, since
      // `buildCanonicalizedResource` must NOT run any decoding step on it.
      const stringToSign = buildStringToSign({
        method: 'GET',
        path: '/mycontainer',
        account: 'myaccount',
        accountKey: ACCOUNT_KEY,
        contentLength: 0,
        query: { Prefix: 'a b', RESTYPE: 'container' },
      });
      asserts.assert(
        stringToSign.endsWith(
          '/myaccount/mycontainer\nprefix:a b\nrestype:container',
        ),
      );
    });

    it('uses a raw value containing a literal "%" as-is, without decoding', () => {
      // Regression test: `decodeURIComponent('50% off/')` throws
      // `URIError: URI malformed` because `% o` isn't a valid escape
      // sequence. Since `query` values are already raw (never encoded),
      // no decoding step should run here at all, so a value like this
      // — a perfectly ordinary `prefix` a caller might pass to
      // `listObjects` — must pass through untouched instead of crashing.
      const stringToSign = buildStringToSign({
        method: 'GET',
        path: '/mycontainer',
        account: 'myaccount',
        accountKey: ACCOUNT_KEY,
        contentLength: 0,
        query: { prefix: '50% off/', restype: 'container' },
      });
      asserts.assert(
        stringToSign.endsWith(
          '/myaccount/mycontainer\nprefix:50% off/\nrestype:container',
        ),
      );
    });
  });

  describe('CanonicalizedHeaders — whitespace handling', () => {
    it('collapses internal linear whitespace and trims values', () => {
      const stringToSign = buildStringToSign({
        method: 'GET',
        path: '/mycontainer/myblob.txt',
        account: ACCOUNT,
        accountKey: ACCOUNT_KEY,
        contentLength: 0,
        headers: {
          'x-ms-meta-note': '  hello   world  ',
        },
      });
      asserts.assertStringIncludes(
        stringToSign,
        'x-ms-meta-note:hello world\n',
      );
    });

    it('emits an empty-valued header as `name:`', () => {
      const stringToSign = buildStringToSign({
        method: 'GET',
        path: '/mycontainer/myblob.txt',
        account: ACCOUNT,
        accountKey: ACCOUNT_KEY,
        contentLength: 0,
        headers: {
          'x-ms-meta-empty': '',
        },
      });
      asserts.assertStringIncludes(stringToSign, 'x-ms-meta-empty:\n');
    });

    it('ignores non x-ms-* headers entirely', () => {
      const stringToSign = buildStringToSign({
        method: 'GET',
        path: '/mycontainer/myblob.txt',
        account: ACCOUNT,
        accountKey: ACCOUNT_KEY,
        contentLength: 0,
        headers: {
          'Content-Type': 'text/plain',
          Accept: 'application/xml',
        },
      });
      asserts.assert(!stringToSign.includes('accept:'));
    });
  });

  describe('payloadByteLength', () => {
    it('returns 0 for undefined/null', () => {
      asserts.assertEquals(payloadByteLength(undefined), 0);
      asserts.assertEquals(payloadByteLength(null), 0);
    });

    it('measures UTF-8 byte length of a string, not character length', () => {
      asserts.assertEquals(payloadByteLength('hello world'), 11);
      // '€' is 1 UTF-16 code unit but 3 UTF-8 bytes.
      asserts.assertEquals(payloadByteLength('€'), 3);
    });

    it('measures Uint8Array and ArrayBuffer directly', () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      asserts.assertEquals(payloadByteLength(bytes), 4);
      asserts.assertEquals(payloadByteLength(bytes.buffer), 4);
    });

    it('measures Blob size', () => {
      const blob = new Blob(['hello world']);
      asserts.assertEquals(payloadByteLength(blob), 11);
    });
  });
});
