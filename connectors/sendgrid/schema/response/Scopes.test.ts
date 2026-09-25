import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ScopesResponseSchemaObject } from './Scopes.ts';

describe('SendGrid.schema.Scopes', () => {
  it('accepts a populated scopes list', () => {
    const [error, scopes] = ScopesResponseSchemaObject.safeParse({
      scopes: ['mail.send', 'alerts.read'],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(scopes?.scopes.length, 2);
  });

  it('accepts an empty scopes list', () => {
    asserts.assertEquals(
      ScopesResponseSchemaObject.safeParse({ scopes: [] })[0],
      null,
    );
  });

  it('rejects a missing scopes field', () => {
    asserts.assertExists(ScopesResponseSchemaObject.safeParse({})[0]);
  });

  it('rejects a non-array scopes field', () => {
    asserts.assertExists(
      ScopesResponseSchemaObject.safeParse({ scopes: 'mail.send' })[0],
    );
  });

  it('rejects non-string scope entries', () => {
    asserts.assertExists(
      ScopesResponseSchemaObject.safeParse({ scopes: [null] })[0],
    );
  });
});
