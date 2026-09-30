import * as asserts from '@asserts';
import { describe, it } from '@test';
import { TagSchemaObject } from './Tag.ts';

describe('Resend.schema.Tag', () => {
  it('accepts letters, digits, underscores and dashes', () => {
    const [error, tag] = TagSchemaObject.safeParse({
      name: 'order_id',
      value: 'ord-123_ABC',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(tag, { name: 'order_id', value: 'ord-123_ABC' });
  });

  for (
    const [label, value] of [
      ['a space', 'a b'],
      ['an @', 'a@b.com'],
      ['a dot', 'a.b'],
      ['an empty string', ''],
      ['257 characters', 'x'.repeat(257)],
    ]
  ) {
    it(`rejects a value containing ${label}`, () => {
      const [error] = TagSchemaObject.safeParse({ name: 'n', value });
      asserts.assertExists(error);
    });
  }

  it('accepts exactly 256 characters', () => {
    const [error] = TagSchemaObject.safeParse({
      name: 'n'.repeat(256),
      value: 'v',
    });
    asserts.assertEquals(error, null);
  });

  it('requires both name and value', () => {
    asserts.assertExists(TagSchemaObject.safeParse({ name: 'n' })[0]);
    asserts.assertExists(TagSchemaObject.safeParse({ value: 'v' })[0]);
  });
});
