import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  DnsRecordBatchRequestSchemaObject,
  DnsRecordBatchResultSchemaObject,
} from './DnsRecordBatch.ts';

describe('CloudflareDNS.schema.DnsRecordBatch', () => {
  it('accepts all four lists', () => {
    const [error, batch] = DnsRecordBatchRequestSchemaObject.safeParse({
      deletes: [{ id: 'd1' }],
      patches: [{ id: 'p1', comment: 'patched' }],
      puts: [{
        id: 'u1',
        type: 'A',
        name: 'a.example.com',
        content: '203.0.113.1',
      }],
      posts: [{ type: 'TXT', name: 'example.com', content: '"v=spf1 -all"' }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(batch?.patches?.[0]?.id, 'p1');
    asserts.assertEquals(batch?.posts?.[0]?.type, 'TXT');
  });

  it('accepts an empty object — the client enforces at least one operation', () => {
    asserts.assertEquals(
      DnsRecordBatchRequestSchemaObject.safeParse({})[0],
      null,
    );
  });

  it('rejects a delete without an id, a put without a type, a post with a bad ttl', () => {
    asserts.assertExists(
      DnsRecordBatchRequestSchemaObject.safeParse({ deletes: [{}] })[0],
    );
    asserts.assertExists(
      DnsRecordBatchRequestSchemaObject.safeParse({
        puts: [{ id: 'u1', name: 'a.example.com', content: 'c' }],
      })[0],
    );
    asserts.assertExists(
      DnsRecordBatchRequestSchemaObject.safeParse({
        posts: [{ type: 'A', name: 'a.example.com', content: 'c', ttl: 7 }],
      })[0],
    );
  });

  it('accepts a result with some lists absent', () => {
    const [error, result] = DnsRecordBatchResultSchemaObject.safeParse({
      deletes: [{ id: 'd1', name: 'old.example.com', type: 'A' }],
      posts: [],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.deletes?.length, 1);
    asserts.assertEquals(result?.patches, undefined);
  });

  it('rejects a result whose list holds a malformed record', () => {
    asserts.assertExists(
      DnsRecordBatchResultSchemaObject.safeParse({ posts: [{ name: 'n' }] })[0],
    );
  });
});
