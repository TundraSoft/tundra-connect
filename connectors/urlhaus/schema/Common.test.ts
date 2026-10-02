import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  BlacklistsSchemaObject,
  QueryStatusEnvelopeSchemaObject,
  URLHAUS_QUERY_STATUSES,
  VirusTotalSchemaObject,
} from './Common.ts';

describe('URLhaus.schema.Common', () => {
  it('reads query_status and keeps every other field', () => {
    const [error, envelope] = QueryStatusEnvelopeSchemaObject.safeParse({
      query_status: 'ok',
      url: 'http://x.example/',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.query_status, 'ok');
    asserts.assertEquals(
      (envelope as Record<string, unknown>).url,
      'http://x.example/',
    );
  });

  it('accepts an undocumented query_status rather than failing', () => {
    asserts.assertEquals(
      QueryStatusEnvelopeSchemaObject.safeParse({ query_status: 'new_one' })[0],
      null,
    );
  });

  it('rejects a body without query_status', () => {
    asserts.assertExists(
      QueryStatusEnvelopeSchemaObject.safeParse({ error: 'Unauthorized' })[0],
    );
  });

  it('documents ok and no_results among the statuses', () => {
    asserts.assert(URLHAUS_QUERY_STATUSES.includes('ok'));
    asserts.assert(URLHAUS_QUERY_STATUSES.includes('no_results'));
  });

  it('accepts partial blacklists', () => {
    asserts.assertEquals(
      BlacklistsSchemaObject.safeParse({ surbl: 'not listed' })[0],
      null,
    );
  });

  it('parses a VirusTotal summary', () => {
    const [error, vt] = VirusTotalSchemaObject.safeParse({
      result: '17 / 69',
      percent: '24.64',
      link: 'https://www.virustotal.com/file/x/analysis/1/',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(vt?.percent, '24.64');
  });
});
