import * as asserts from '@asserts';
import { describe, it } from '@test';
import { UrlEntrySchemaObject, UrlPayloadSchemaObject } from './Url.ts';

describe('URLhaus.schema.Url', () => {
  it('parses a documented URL entry', () => {
    const [error, entry] = UrlEntrySchemaObject.safeParse({
      query_status: 'ok',
      id: '105821',
      url: 'http://sskymedia.com/VMYB-ht_JAQo-gi/',
      url_status: 'online',
      last_online: null,
      threat: 'malware_download',
      blacklists: { spamhaus_dbl: 'abused_legit_malware', surbl: 'listed' },
      larted: 'true',
      takedown_time_seconds: null,
      tags: ['emotet'],
      payloads: [],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(entry?.url_status, 'online');
    asserts.assertEquals(entry?.tags, ['emotet']);
  });

  it('accepts an entry with every documented field missing', () => {
    asserts.assertEquals(UrlEntrySchemaObject.safeParse({})[0], null);
  });

  it('accepts null tags and payloads', () => {
    asserts.assertEquals(
      UrlEntrySchemaObject.safeParse({ tags: null, payloads: null })[0],
      null,
    );
  });

  it('keeps numeric strings as strings, and stringifies a number', () => {
    const [, entry] = UrlEntrySchemaObject.safeParse({
      id: 105821,
      takedown_time_seconds: 3600,
    });
    asserts.assertEquals(entry?.id, '105821');
    asserts.assertEquals(entry?.takedown_time_seconds, '3600');
  });

  it('rejects tags that are not an array', () => {
    asserts.assertExists(UrlEntrySchemaObject.safeParse({ tags: 'emotet' })[0]);
  });

  it('parses a payload with a null VirusTotal summary', () => {
    const [error, payload] = UrlPayloadSchemaObject.safeParse({
      firstseen: '2019-01-19',
      filename: null,
      response_size: '174928',
      signature: 'Heodo',
      virustotal: null,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(payload?.virustotal, null);
  });
});
