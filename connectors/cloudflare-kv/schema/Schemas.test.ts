import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  BulkGetResultSchemaObject,
  BulkResultSchemaObject,
  ErrorEnvelopeSchemaObject,
  KeyPageSchemaObject,
  KeySchemaObject,
  ListKeysQuerySchemaObject,
  ListNamespacesQuerySchemaObject,
  NamespacePageSchemaObject,
  NamespaceSchemaObject,
  ResultInfoSchemaObject,
} from './mod.ts';

describe('CloudflareKV.schemas', () => {
  it('parses a namespace and keeps unknown fields', () => {
    const [error, ns] = NamespaceSchemaObject.safeParse({
      id: '0f2ac74b498b48028cb68387c421e279',
      title: 'redirects',
      supports_url_encoding: true,
      beta: false,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(ns?.title, 'redirects');
    asserts.assertEquals(ns?.beta, false);
  });

  it('rejects a namespace without an id', () => {
    const [error] = NamespaceSchemaObject.safeParse({ title: 'x' });
    asserts.assertExists(error);
  });

  it('parses a namespace page', () => {
    const [error, page] = NamespacePageSchemaObject.safeParse({
      result: [{ id: 'a', title: 'one' }],
      result_info: { page: 1, per_page: 20, count: 1, total_count: 1 },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.result_info?.total_count, 1);
  });

  it('parses keys with and without expiration and metadata', () => {
    const [error, page] = KeyPageSchemaObject.safeParse({
      result: [
        { name: 'a' },
        { name: 'b', expiration: 1893456000, metadata: { owner: 'x' } },
        { name: 'c', metadata: null },
      ],
      result_info: { count: 3, cursor: 'next' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.result.length, 3);
    asserts.assertEquals(page?.result[1]?.metadata, { owner: 'x' });
    asserts.assertEquals(page?.result_info?.cursor, 'next');
    asserts.assertExists(KeySchemaObject.safeParse({ expiration: 1 })[0]);
  });

  it('validates the list-keys query bounds', () => {
    asserts.assertEquals(
      ListKeysQuerySchemaObject.safeParse({ prefix: 'r:', limit: 10 })[0],
      null,
    );
    asserts.assertExists(ListKeysQuerySchemaObject.safeParse({ limit: 9 })[0]);
    asserts.assertExists(
      ListKeysQuerySchemaObject.safeParse({ limit: 1001 })[0],
    );
  });

  it('validates the list-namespaces query', () => {
    asserts.assertEquals(
      ListNamespacesQuerySchemaObject.safeParse({
        page: 2,
        per_page: 1000,
        order: 'title',
        direction: 'desc',
      })[0],
      null,
    );
    asserts.assertExists(
      ListNamespacesQuerySchemaObject.safeParse({ order: 'name' })[0],
    );
    asserts.assertExists(
      ListNamespacesQuerySchemaObject.safeParse({ per_page: 0 })[0],
    );
  });

  it('parses a bulk result, both fields optional', () => {
    asserts.assertEquals(
      BulkResultSchemaObject.safeParse({
        successful_key_count: 2,
        unsuccessful_keys: ['x'],
      })[1],
      { successful_key_count: 2, unsuccessful_keys: ['x'] },
    );
    asserts.assertEquals(BulkResultSchemaObject.safeParse({})[0], null);
  });

  it('parses bulk-read values, null for a missing key', () => {
    const [error, result] = BulkGetResultSchemaObject.safeParse({
      values: { a: 'x', b: null, c: { value: 1, metadata: null } },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.values.b, null);
    asserts.assertExists(BulkGetResultSchemaObject.safeParse({})[0]);
  });

  it('parses the paging block and the error envelope', () => {
    asserts.assertEquals(
      ResultInfoSchemaObject.safeParse({ count: 0, cursor: '' })[0],
      null,
    );
    const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
      success: false,
      errors: [{ code: 10009, message: "get: 'key not found'" }],
      messages: [],
      result: null,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.errors[0]?.code, 10009);
  });
});
