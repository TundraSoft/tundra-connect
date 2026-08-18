import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  AlgoliaObjectPayloadSchemaObject,
  AlgoliaObjectSchemaObject,
} from './Common.ts';

describe('Algolia.schema.Common', () => {
  describe('AlgoliaObjectSchemaObject', () => {
    it('accepts an object with only the managed objectID field', () => {
      const [error, value] = AlgoliaObjectSchemaObject.safeParse({
        objectID: 'abc123',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(value?.objectID, 'abc123');
    });

    it('passes through arbitrary caller-defined fields', () => {
      const [error, value] = AlgoliaObjectSchemaObject.safeParse({
        objectID: 'abc123',
        name: 'Blue socks',
        price: 4.5,
        tags: ['clothing', 'blue'],
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(value?.name, 'Blue socks');
      asserts.assertEquals(value?.price, 4.5);
      asserts.assertEquals(value?.tags, ['clothing', 'blue']);
    });

    it('rejects a record missing objectID', () => {
      const [error, value] = AlgoliaObjectSchemaObject.safeParse({
        name: 'Blue socks',
      });
      asserts.assertExists(error);
      asserts.assertEquals(value, undefined);
    });
  });

  describe('AlgoliaObjectPayloadSchemaObject', () => {
    it('accepts an arbitrary plain object', () => {
      const [error, value] = AlgoliaObjectPayloadSchemaObject.safeParse({
        name: 'Blue socks',
        price: 4.5,
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(value?.name, 'Blue socks');
    });

    it('accepts an empty object', () => {
      const [error, value] = AlgoliaObjectPayloadSchemaObject.safeParse({});
      asserts.assertEquals(error, null);
      asserts.assertEquals(value, {});
    });

    it('rejects an array payload', () => {
      const [error, value] = AlgoliaObjectPayloadSchemaObject.safeParse([
        1,
        2,
        3,
      ]);
      asserts.assertExists(error);
      asserts.assertEquals(value, undefined);
    });

    it('rejects a primitive payload', () => {
      const [error, value] = AlgoliaObjectPayloadSchemaObject.safeParse(
        'not-an-object',
      );
      asserts.assertExists(error);
      asserts.assertEquals(value, undefined);
    });

    it('rejects null', () => {
      const [error, value] = AlgoliaObjectPayloadSchemaObject.safeParse(null);
      asserts.assertExists(error);
      asserts.assertEquals(value, undefined);
    });
  });
});
