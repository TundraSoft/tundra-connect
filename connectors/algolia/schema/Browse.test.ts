import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  BrowseRequestSchemaObject,
  BrowseResponseSchemaObject,
} from './Browse.ts';

describe('Algolia.schema.Browse', () => {
  describe('BrowseRequestSchemaObject', () => {
    it('accepts an empty request (first page of a scan)', () => {
      const [error, value] = BrowseRequestSchemaObject.safeParse({});
      asserts.assertEquals(error, null);
      asserts.assertEquals(value, {});
    });

    it('accepts a cursor from a previous page', () => {
      const [error, value] = BrowseRequestSchemaObject.safeParse({
        cursor: 'opaque-cursor-token',
        hitsPerPage: 1000,
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(value?.cursor, 'opaque-cursor-token');
    });
  });

  describe('BrowseResponseSchemaObject', () => {
    it('accepts a page with a cursor (more pages remain)', () => {
      const [error, value] = BrowseResponseSchemaObject.safeParse({
        hits: [{ objectID: '1' }],
        cursor: 'opaque-cursor-token',
        processingTimeMS: 3,
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(value?.cursor, 'opaque-cursor-token');
    });

    it('accepts the last page (no cursor)', () => {
      const [error, value] = BrowseResponseSchemaObject.safeParse({
        hits: [{ objectID: '2' }],
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(value?.cursor, undefined);
    });

    it('rejects a response missing hits', () => {
      const [error, value] = BrowseResponseSchemaObject.safeParse({
        cursor: 'opaque-cursor-token',
      });
      asserts.assertExists(error);
      asserts.assertEquals(value, undefined);
    });
  });
});
