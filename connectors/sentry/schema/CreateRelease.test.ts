import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CreateReleaseRequestSchemaObject } from './CreateRelease.ts';

describe('Sentry.schema.CreateReleaseRequest', () => {
  it('accepts the minimal required fields', () => {
    asserts.assertEquals(
      CreateReleaseRequestSchemaObject.safeParse({
        version: 'frontend@1.0.0',
        projects: ['frontend'],
      })[0],
      null,
    );
  });

  it('accepts a fully-populated release', () => {
    const [err] = CreateReleaseRequestSchemaObject.safeParse({
      version: 'frontend@1.0.0',
      projects: ['frontend', 'backend'],
      ref: 'abc123',
      url: 'https://ci.example.com/builds/42',
      dateReleased: '2024-01-01T00:00:00Z',
      commits: [
        {
          id: 'abc123',
          repository: 'my-org/frontend',
          message: 'Fix bug',
          author_name: 'Jane Doe',
          author_email: 'jane@example.com',
        },
      ],
      refs: [
        { repository: 'my-org/frontend', commit: 'abc123' },
      ],
    });
    asserts.assertEquals(err, null);
  });

  it('rejects a request missing the required version', () => {
    asserts.assertExists(
      CreateReleaseRequestSchemaObject.safeParse({ projects: ['frontend'] })[0],
    );
  });

  it('rejects a request missing the required projects', () => {
    asserts.assertExists(
      CreateReleaseRequestSchemaObject.safeParse({
        version: 'frontend@1.0.0',
      })[0],
    );
  });

  it('rejects an empty projects array', () => {
    asserts.assertExists(
      CreateReleaseRequestSchemaObject.safeParse({
        version: 'frontend@1.0.0',
        projects: [],
      })[0],
    );
  });

  it("rejects a version of '.'", () => {
    asserts.assertExists(
      CreateReleaseRequestSchemaObject.safeParse({
        version: '.',
        projects: ['frontend'],
      })[0],
    );
  });

  it('rejects a version containing a forward slash', () => {
    asserts.assertExists(
      CreateReleaseRequestSchemaObject.safeParse({
        version: 'frontend/1.0.0',
        projects: ['frontend'],
      })[0],
    );
  });

  it('rejects a version containing a newline', () => {
    asserts.assertExists(
      CreateReleaseRequestSchemaObject.safeParse({
        version: 'frontend@1.0.0\n',
        projects: ['frontend'],
      })[0],
    );
  });

  it('rejects a commit missing the required id', () => {
    asserts.assertExists(
      CreateReleaseRequestSchemaObject.safeParse({
        version: 'frontend@1.0.0',
        projects: ['frontend'],
        commits: [{ message: 'Fix bug' }],
      })[0],
    );
  });
});
