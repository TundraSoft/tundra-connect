import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ReleaseSchemaObject } from './Release.ts';

describe('Sentry.schema.Release', () => {
  it('accepts a documented example release', () => {
    asserts.assertEquals(
      ReleaseSchemaObject.safeParse({
        id: 1,
        version: 'frontend@1.0.0',
        status: 'open',
        dateCreated: '2024-01-01T00:00:00Z',
        commitCount: 0,
        projects: [
          { id: 1, slug: 'sentry', name: 'sentry', platform: 'javascript' },
        ],
      })[0],
      null,
    );
  });

  it('accepts a string id', () => {
    asserts.assertEquals(
      ReleaseSchemaObject.safeParse({
        id: 'abc-123',
        version: 'frontend@1.0.0',
        dateCreated: '2024-01-01T00:00:00Z',
      })[0],
      null,
    );
  });

  it('accepts null ref/url/dateReleased', () => {
    asserts.assertEquals(
      ReleaseSchemaObject.safeParse({
        id: 1,
        version: 'frontend@1.0.0',
        dateCreated: '2024-01-01T00:00:00Z',
        ref: null,
        url: null,
        dateReleased: null,
      })[0],
      null,
    );
  });

  it('rejects a release missing the required version', () => {
    asserts.assertExists(
      ReleaseSchemaObject.safeParse({
        id: 1,
        dateCreated: '2024-01-01T00:00:00Z',
      })[0],
    );
  });

  it('rejects a release missing the required dateCreated', () => {
    asserts.assertExists(
      ReleaseSchemaObject.safeParse({ id: 1, version: 'frontend@1.0.0' })[0],
    );
  });
});
