import * as asserts from '@asserts';
import { describe, it } from '@test';
import { HostEntrySchemaObject, HostUrlSchemaObject } from './Host.ts';

describe('URLhaus.schema.Host', () => {
  it('parses a documented host entry', () => {
    const [error, host] = HostEntrySchemaObject.safeParse({
      host: 'vektorex.com',
      firstseen: '2019-01-15 07:09:01 UTC',
      url_count: '120',
      blacklists: { spamhaus_dbl: 'abused_legit_malware', surbl: 'not listed' },
      urls: [{ id: '121319', url_status: 'online', tags: ['exe'] }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(host?.urls?.[0]?.id, '121319');
  });

  it('accepts an IPv4 host without blacklists', () => {
    asserts.assertEquals(
      HostEntrySchemaObject.safeParse({ host: '45.61.49.78', urls: [] })[0],
      null,
    );
  });

  it('rejects a urls value that is not an array', () => {
    asserts.assertExists(HostEntrySchemaObject.safeParse({ urls: {} })[0]);
  });

  it('accepts a host URL with null tags', () => {
    asserts.assertEquals(
      HostUrlSchemaObject.safeParse({ tags: null })[0],
      null,
    );
  });
});
