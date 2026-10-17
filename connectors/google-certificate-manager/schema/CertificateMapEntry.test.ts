import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CertificateMapEntrySchemaObject } from './CertificateMapEntry.ts';

describe('GoogleCertificateManager.schema.CertificateMapEntry', () => {
  it('accepts a hostname entry', () => {
    const entry = CertificateMapEntrySchemaObject.parse({
      name:
        'projects/p/locations/global/certificateMaps/m/certificateMapEntries/e',
      hostname: 'example.com',
      certificates: ['projects/p/locations/global/certificates/c'],
      state: 'ACTIVE',
      labels: { owner: 'brevily' },
    });
    asserts.assertEquals(entry.hostname, 'example.com');
    asserts.assertEquals(entry.state, 'ACTIVE');
  });

  it('accepts a PRIMARY matcher entry', () => {
    const entry = CertificateMapEntrySchemaObject.parse({
      name:
        'projects/p/locations/global/certificateMaps/m/certificateMapEntries/p',
      matcher: 'PRIMARY',
    });
    asserts.assertEquals(entry.matcher, 'PRIMARY');
  });

  it('rejects an entry without a name or with malformed certificates', () => {
    for (
      const bad of [
        { hostname: 'example.com' },
        { name: 'n', certificates: 'c' },
      ]
    ) {
      const [error] = CertificateMapEntrySchemaObject.safeParse(bad);
      asserts.assertExists(error);
    }
  });
});
