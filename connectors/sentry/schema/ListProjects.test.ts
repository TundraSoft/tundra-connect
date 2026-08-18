import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ListProjectsRequestSchemaObject,
  ListProjectsResponseSchemaObject,
} from './ListProjects.ts';

describe('Sentry.schema.ListProjectsRequest', () => {
  it('accepts an empty filter (all fields optional)', () => {
    asserts.assertEquals(
      ListProjectsRequestSchemaObject.safeParse({})[0],
      null,
    );
  });

  it('accepts documented filter/pagination fields', () => {
    asserts.assertEquals(
      ListProjectsRequestSchemaObject.safeParse({
        cursor: '0:100:0',
        perPage: 50,
        query: 'pump',
      })[0],
      null,
    );
  });

  it('rejects a perPage over 100', () => {
    asserts.assertExists(
      ListProjectsRequestSchemaObject.safeParse({ perPage: 101 })[0],
    );
  });

  it('rejects an empty cursor string', () => {
    asserts.assertExists(
      ListProjectsRequestSchemaObject.safeParse({ cursor: '' })[0],
    );
  });
});

describe('Sentry.schema.ListProjectsResponse', () => {
  it('accepts an empty page', () => {
    asserts.assertEquals(
      ListProjectsResponseSchemaObject.safeParse({ projects: [] })[0],
      null,
    );
  });

  it('accepts a page with projects and a nextCursor', () => {
    const [err, page] = ListProjectsResponseSchemaObject.safeParse({
      projects: [
        {
          id: '2',
          slug: 'pump-station',
          name: 'Pump Station',
          dateCreated: '2018-11-06T21:19:55Z',
        },
      ],
      nextCursor: '0:100:0',
    });
    asserts.assertEquals(err, null);
    asserts.assertEquals(page?.projects.length, 1);
    asserts.assertEquals(page?.nextCursor, '0:100:0');
  });

  it('leaves nextCursor undefined when absent', () => {
    const [err, page] = ListProjectsResponseSchemaObject.safeParse({
      projects: [],
    });
    asserts.assertEquals(err, null);
    asserts.assertEquals(page?.nextCursor, undefined);
  });

  it('rejects a page missing the required projects array', () => {
    asserts.assertExists(ListProjectsResponseSchemaObject.safeParse({})[0]);
  });

  it('rejects a malformed project entry within the page', () => {
    asserts.assertExists(
      ListProjectsResponseSchemaObject.safeParse({
        projects: [{ id: '2' }],
      })[0],
    );
  });
});
