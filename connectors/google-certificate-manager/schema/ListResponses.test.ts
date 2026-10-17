import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ListCertificateMapEntriesResponseSchemaObject,
  ListCertificatesResponseSchemaObject,
} from './ListResponses.ts';

describe('GoogleCertificateManager.schema.ListResponses', () => {
  it('accepts certificate pages, including an empty one', () => {
    const page = ListCertificatesResponseSchemaObject.parse({
      certificates: [{ name: 'projects/p/locations/global/certificates/a' }],
      nextPageToken: 'n',
      unreachable: [],
    });
    asserts.assertEquals(page.certificates?.length, 1);
    asserts.assertEquals(
      ListCertificatesResponseSchemaObject.parse({}).certificates,
      undefined,
    );
  });

  it('accepts map entry pages', () => {
    const page = ListCertificateMapEntriesResponseSchemaObject.parse({
      certificateMapEntries: [{ name: 'e', hostname: 'example.com' }],
    });
    asserts.assertEquals(
      page.certificateMapEntries?.[0]?.hostname,
      'example.com',
    );
  });

  it('rejects a page whose items are malformed', () => {
    asserts.assertExists(
      ListCertificatesResponseSchemaObject.safeParse({ certificates: [{}] })[0],
    );
    asserts.assertExists(
      ListCertificateMapEntriesResponseSchemaObject.safeParse({
        certificateMapEntries: 'x',
      })[0],
    );
  });
});
