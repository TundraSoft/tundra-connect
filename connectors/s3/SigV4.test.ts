import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  buildCanonicalRequest,
  canonicalHeaders,
  canonicalQueryString,
  EMPTY_PAYLOAD_SHA256,
  formatAmzDate,
  sha256Hex,
  signV4,
  uriEncode,
} from './SigV4.ts';

// Shared fixture straight out of AWS's own published SigV4 worked examples
// ("Examples of the Complete Version 4 Signing Process"). Every expected
// value below (canonical request strings AND final signatures) is copied
// verbatim from that documentation — if this test ever fails, the bug is
// in this implementation, not the fixture.
const CREDENTIALS = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
};
const DATE = new Date('2013-05-24T00:00:00Z');
const AMZ_DATE = '20130524T000000Z';
const HOST = 'examplebucket.s3.amazonaws.com';

describe('SigV4.formatAmzDate', () => {
  it('formats a Date as YYYYMMDDTHHMMSSZ', () => {
    asserts.assertEquals(formatAmzDate(DATE), AMZ_DATE);
  });
});

describe('SigV4.uriEncode', () => {
  it('leaves unreserved characters literal', () => {
    asserts.assertEquals(uriEncode('abcXYZ019-._~'), 'abcXYZ019-._~');
  });

  it('escapes space as %20, not +', () => {
    asserts.assertEquals(uriEncode('a b'), 'a%20b');
  });

  it('escapes / and uses uppercase hex', () => {
    asserts.assertEquals(uriEncode('a/b'), 'a%2Fb');
    asserts.assertEquals(uriEncode('$'), '%24');
  });

  it('escapes characters encodeURIComponent leaves alone', () => {
    // encodeURIComponent alone leaves ! ' ( ) * unescaped — AWS wants them escaped.
    asserts.assertEquals(uriEncode(`!'()*`), '%21%27%28%29%2A');
  });
});

describe('SigV4.canonicalQueryString', () => {
  it('returns an empty string when there is no query', () => {
    asserts.assertEquals(canonicalQueryString(undefined), '');
    asserts.assertEquals(canonicalQueryString({}), '');
  });

  it('emits key= for an empty value', () => {
    asserts.assertEquals(canonicalQueryString({ lifecycle: '' }), 'lifecycle=');
  });

  it('sorts parameters alphabetically by encoded key', () => {
    asserts.assertEquals(
      canonicalQueryString({ prefix: 'J', 'max-keys': '2' }),
      'max-keys=2&prefix=J',
    );
  });
});

describe('SigV4.canonicalHeaders', () => {
  it('lowercases names, trims values, and sorts alphabetically', () => {
    const { canonicalHeaders: ch, signedHeaders } = canonicalHeaders({
      'X-Amz-Date': AMZ_DATE,
      Host: HOST,
      Range: ' bytes=0-9 ',
    });
    asserts.assertEquals(
      ch,
      `host:${HOST}\nrange:bytes=0-9\nx-amz-date:${AMZ_DATE}\n`,
    );
    asserts.assertEquals(signedHeaders, 'host;range;x-amz-date');
  });

  it('collapses sequential internal whitespace in values to a single space', () => {
    // AWS's canonicalization contract: the header actually SENT keeps its
    // original spacing — the server collapses the received value the same
    // way before verifying, so only the canonical form collapses here.
    const { canonicalHeaders: ch } = canonicalHeaders({
      'x-amz-meta-note': 'two  spaces',
      'Content-Type': 'text/plain;\t charset=utf-8',
    });
    asserts.assertEquals(
      ch,
      'content-type:text/plain; charset=utf-8\n' +
        'x-amz-meta-note:two spaces\n',
    );
  });
});

describe('SigV4 — AWS published test vectors', () => {
  // Vector 1 — GET Object (https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html)
  it('matches AWS Vector 1: GET Object', async () => {
    const result = await signV4({
      method: 'GET',
      canonicalUri: '/test.txt',
      headers: {
        host: HOST,
        range: 'bytes=0-9',
        'x-amz-content-sha256': EMPTY_PAYLOAD_SHA256,
        'x-amz-date': AMZ_DATE,
      },
      payloadHash: EMPTY_PAYLOAD_SHA256,
      date: DATE,
      credentials: CREDENTIALS,
    });

    asserts.assertEquals(
      result.canonicalRequest,
      'GET\n' +
        '/test.txt\n' +
        '\n' +
        `host:${HOST}\n` +
        'range:bytes=0-9\n' +
        `x-amz-content-sha256:${EMPTY_PAYLOAD_SHA256}\n` +
        `x-amz-date:${AMZ_DATE}\n` +
        '\n' +
        'host;range;x-amz-content-sha256;x-amz-date\n' +
        EMPTY_PAYLOAD_SHA256,
    );
    asserts.assertEquals(
      result.signature,
      'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    asserts.assertEquals(
      result.authorization,
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
  });

  // Vector 2 — PUT Object (key literally `test$file.text`)
  it('matches AWS Vector 2: PUT Object', async () => {
    // The key contains a `$`, which must be percent-encoded the same way
    // both here (via uriEncode, exercised for its own sake) and as the
    // literal expected canonical URI below.
    asserts.assertEquals(uriEncode('test$file.text'), 'test%24file.text');

    const payloadHash =
      '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072';
    const result = await signV4({
      method: 'PUT',
      canonicalUri: '/test%24file.text',
      headers: {
        Date: 'Fri, 24 May 2013 00:00:00 GMT',
        host: HOST,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': AMZ_DATE,
        'x-amz-storage-class': 'REDUCED_REDUNDANCY',
      },
      payloadHash,
      date: DATE,
      credentials: CREDENTIALS,
    });

    asserts.assertEquals(
      result.canonicalRequest,
      'PUT\n' +
        '/test%24file.text\n' +
        '\n' +
        'date:Fri, 24 May 2013 00:00:00 GMT\n' +
        `host:${HOST}\n` +
        `x-amz-content-sha256:${payloadHash}\n` +
        `x-amz-date:${AMZ_DATE}\n` +
        'x-amz-storage-class:REDUCED_REDUNDANCY\n' +
        '\n' +
        'date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class\n' +
        payloadHash,
    );
    asserts.assertEquals(
      result.signature,
      '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd',
    );
  });

  // Vector 3 — GET Bucket Lifecycle (empty body, single sub-resource query param)
  it('matches AWS Vector 3: GET Bucket Lifecycle', async () => {
    const result = await signV4({
      method: 'GET',
      canonicalUri: '/',
      query: { lifecycle: '' },
      headers: {
        host: HOST,
        'x-amz-content-sha256': EMPTY_PAYLOAD_SHA256,
        'x-amz-date': AMZ_DATE,
      },
      payloadHash: EMPTY_PAYLOAD_SHA256,
      date: DATE,
      credentials: CREDENTIALS,
    });

    asserts.assertEquals(
      result.canonicalRequest,
      'GET\n' +
        '/\n' +
        'lifecycle=\n' +
        `host:${HOST}\n` +
        `x-amz-content-sha256:${EMPTY_PAYLOAD_SHA256}\n` +
        `x-amz-date:${AMZ_DATE}\n` +
        '\n' +
        'host;x-amz-content-sha256;x-amz-date\n' +
        EMPTY_PAYLOAD_SHA256,
    );
    asserts.assertEquals(
      result.signature,
      'fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543',
    );
  });

  // Vector 4 — GET Bucket (List Objects) — exercises query-string sorting
  it('matches AWS Vector 4: GET Bucket (List Objects)', async () => {
    const result = await signV4({
      method: 'GET',
      canonicalUri: '/',
      query: { 'max-keys': '2', prefix: 'J' },
      headers: {
        host: HOST,
        'x-amz-content-sha256': EMPTY_PAYLOAD_SHA256,
        'x-amz-date': AMZ_DATE,
      },
      payloadHash: EMPTY_PAYLOAD_SHA256,
      date: DATE,
      credentials: CREDENTIALS,
    });

    asserts.assertEquals(
      result.canonicalRequest,
      'GET\n' +
        '/\n' +
        'max-keys=2&prefix=J\n' +
        `host:${HOST}\n` +
        `x-amz-content-sha256:${EMPTY_PAYLOAD_SHA256}\n` +
        `x-amz-date:${AMZ_DATE}\n` +
        '\n' +
        'host;x-amz-content-sha256;x-amz-date\n' +
        EMPTY_PAYLOAD_SHA256,
    );
    asserts.assertEquals(
      result.signature,
      '34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7',
    );
    asserts.assertEquals(
      result.authorization,
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,' +
        'SignedHeaders=host;x-amz-content-sha256;x-amz-date,' +
        'Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7',
    );
  });
});

describe('SigV4 — internal-whitespace canonicalization', () => {
  it('signs the collapsed canonical form of double-spaced header values', async () => {
    // Regression coverage: canonical header values used to be only
    // `.trim()`ed, but AWS also collapses sequential internal whitespace
    // to a single space before verifying — a metadata value like
    // 'two  spaces' (or a contentType 'text/plain;  charset=utf-8')
    // therefore guaranteed SignatureDoesNotMatch. The header actually
    // SENT keeps the original spacing; only the canonical form collapses.
    const result = await signV4({
      method: 'PUT',
      canonicalUri: '/test.txt',
      headers: {
        host: HOST,
        'Content-Type': 'text/plain;  charset=utf-8',
        'x-amz-content-sha256': EMPTY_PAYLOAD_SHA256,
        'x-amz-date': AMZ_DATE,
        'x-amz-meta-note': 'two  spaces',
      },
      payloadHash: EMPTY_PAYLOAD_SHA256,
      date: DATE,
      credentials: CREDENTIALS,
    });

    asserts.assertEquals(
      result.canonicalRequest,
      'PUT\n' +
        '/test.txt\n' +
        '\n' +
        'content-type:text/plain; charset=utf-8\n' +
        `host:${HOST}\n` +
        `x-amz-content-sha256:${EMPTY_PAYLOAD_SHA256}\n` +
        `x-amz-date:${AMZ_DATE}\n` +
        'x-amz-meta-note:two spaces\n' +
        '\n' +
        'content-type;host;x-amz-content-sha256;x-amz-date;x-amz-meta-note\n' +
        EMPTY_PAYLOAD_SHA256,
    );
    // The string-to-sign hashes exactly that collapsed canonical request.
    asserts.assertEquals(
      result.stringToSign,
      [
        'AWS4-HMAC-SHA256',
        AMZ_DATE,
        '20130524/us-east-1/s3/aws4_request',
        await sha256Hex(result.canonicalRequest),
      ].join('\n'),
    );
  });
});
