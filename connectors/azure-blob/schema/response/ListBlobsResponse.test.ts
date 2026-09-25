import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ListBlobsResponseSchemaObject } from './ListBlobsResponse.ts';

// Fixtures below mirror EXACTLY what `@libs/xml`'s `parse()` — the XML
// parser RESTler bundles and uses internally to parse an
// `application/xml` response body — produces for Azure's documented List
// Blobs response shape. Verified directly against the real parser before
// being hard-coded here, so this test exercises the same shape the
// connect will see over the wire without needing to add the XML library
// as an extra test-only dependency.

describe('AzureBlob.schema.response.ListBlobsResponse', () => {
  it('normalizes a response with two blobs', () => {
    const raw = {
      '@version': '1.0',
      '@encoding': 'utf-8',
      EnumerationResults: {
        '@ServiceEndpoint': 'https://myaccount.blob.core.windows.net/',
        '@ContainerName': 'mycontainer',
        Prefix: 'foo/',
        Marker: null,
        MaxResults: '5000',
        Blobs: {
          Blob: [
            {
              Name: 'foo/blob1.txt',
              Properties: {
                'Last-Modified': 'Tue, 01 Jan 2019 12:00:00 GMT',
                Etag: '"0x8D1234567890ABC"',
                'Content-Length': '11',
                'Content-Type': 'text/plain',
              },
            },
            {
              Name: 'foo/blob2.txt',
              Properties: {
                'Last-Modified': 'Tue, 01 Jan 2019 13:00:00 GMT',
                Etag: '"0x8D1234567890ABD"',
                'Content-Length': '22',
                'Content-Type': 'text/plain',
              },
            },
          ],
        },
        NextMarker: null,
      },
    };

    const [error, parsed] = ListBlobsResponseSchemaObject.safeParse(raw);
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.blobs.length, 2);
    asserts.assertEquals(parsed?.blobs[0]?.name, 'foo/blob1.txt');
    asserts.assertEquals(parsed?.blobs[0]?.contentLength, 11);
    asserts.assertEquals(parsed?.blobs[1]?.name, 'foo/blob2.txt');
    asserts.assertEquals(parsed?.nextMarker, undefined);
  });

  it('normalizes a response with exactly one blob (parser does not wrap it in an array)', () => {
    const raw = {
      EnumerationResults: {
        Prefix: 'foo/',
        Marker: null,
        MaxResults: '5000',
        Blobs: {
          Blob: {
            Name: 'foo/blob1.txt',
            Properties: {
              'Last-Modified': 'Tue, 01 Jan 2019 12:00:00 GMT',
              Etag: '"0x8D1234567890ABC"',
              'Content-Length': '11',
              'Content-Type': 'text/plain',
            },
          },
        },
        NextMarker: null,
      },
    };

    const [error, parsed] = ListBlobsResponseSchemaObject.safeParse(raw);
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.blobs.length, 1);
    asserts.assertEquals(parsed?.blobs[0]?.name, 'foo/blob1.txt');
  });

  it('normalizes an empty listing (parser flattens <Blobs/> to null)', () => {
    const raw = {
      EnumerationResults: {
        Prefix: 'foo/',
        Marker: null,
        MaxResults: '5000',
        Blobs: null,
        NextMarker: null,
      },
    };

    const [error, parsed] = ListBlobsResponseSchemaObject.safeParse(raw);
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.blobs.length, 0);
    asserts.assertEquals(parsed?.nextMarker, undefined);
  });

  it('passes through a non-empty NextMarker as the continuation token', () => {
    const raw = {
      EnumerationResults: {
        Blobs: {
          Blob: {
            Name: 'foo/blob1.txt',
            Properties: {
              'Last-Modified': 'Tue, 01 Jan 2019 12:00:00 GMT',
              Etag: '"0x8D1234567890ABC"',
              'Content-Length': '11',
              'Content-Type': 'text/plain',
            },
          },
        },
        NextMarker: 'abc123==',
      },
    };

    const [error, parsed] = ListBlobsResponseSchemaObject.safeParse(raw);
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.nextMarker, 'abc123==');
  });
  it('reads a present-but-empty <EnumerationResults/> root as an empty listing', () => {
    // The XML parser turns an empty root element into `null`.
    const result = ListBlobsResponseSchemaObject.parse({
      EnumerationResults: null,
    });
    asserts.assertEquals(result.blobs, []);
    asserts.assertEquals(result.nextMarker, undefined);
  });

  it('rejects a body with no <EnumerationResults> root instead of reading it as an empty container', () => {
    for (const body of [{}, { unexpected: true }, 'not xml', null, undefined]) {
      const [error] = ListBlobsResponseSchemaObject.safeParse(body);
      asserts.assertExists(error, `accepted ${JSON.stringify(body)}`);
    }
  });
});
