import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  SearchRequestSchemaObject,
  SearchResponseSchemaObject,
} from './Search.ts';

describe('Algolia.schema.Search', () => {
  describe('SearchRequestSchemaObject', () => {
    it('accepts a query with paging/filter options', () => {
      const [error, value] = SearchRequestSchemaObject.safeParse({
        query: 'red shoes',
        hitsPerPage: 20,
        page: 1,
        filters: 'category:footwear',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(value?.query, 'red shoes');
      asserts.assertEquals(value?.hitsPerPage, 20);
    });

    it('accepts an empty query string (matches every record)', () => {
      const [error, value] = SearchRequestSchemaObject.safeParse({
        query: '',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(value?.query, '');
    });

    it('rejects a request missing query', () => {
      const [error, value] = SearchRequestSchemaObject.safeParse({
        hitsPerPage: 20,
      });
      asserts.assertExists(error);
      asserts.assertEquals(value, undefined);
    });

    it('rejects a non-positive hitsPerPage', () => {
      const [error, value] = SearchRequestSchemaObject.safeParse({
        query: 'x',
        hitsPerPage: 0,
      });
      asserts.assertExists(error);
      asserts.assertEquals(value, undefined);
    });
  });

  describe('SearchResponseSchemaObject', () => {
    it('accepts a documented search response', () => {
      const [error, value] = SearchResponseSchemaObject.safeParse({
        hits: [{ objectID: '1', name: 'Red sneakers' }],
        nbHits: 1,
        page: 0,
        nbPages: 1,
        processingTimeMS: 2,
        query: 'red shoes',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(value?.hits.length, 1);
      asserts.assertEquals(value?.hits[0]?.objectID, '1');
      asserts.assertEquals(value?.hits[0]?.name, 'Red sneakers');
    });

    it('rejects a response missing nbHits', () => {
      const [error, value] = SearchResponseSchemaObject.safeParse({
        hits: [],
        page: 0,
        nbPages: 0,
        processingTimeMS: 1,
        query: '',
      });
      asserts.assertExists(error);
      asserts.assertEquals(value, undefined);
    });

    it('rejects a hit missing objectID', () => {
      const [error, value] = SearchResponseSchemaObject.safeParse({
        hits: [{ name: 'Red sneakers' }],
        nbHits: 1,
        page: 0,
        nbPages: 1,
        processingTimeMS: 1,
        query: 'x',
      });
      asserts.assertExists(error);
      asserts.assertEquals(value, undefined);
    });
  });
});
