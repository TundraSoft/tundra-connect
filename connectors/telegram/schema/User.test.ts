import * as asserts from '@asserts';
import { describe, it } from '@test';
import { UserSchemaObject } from './User.ts';

describe('Telegram.schema.User', () => {
  it('accepts a getMe-shaped bot user', () => {
    const [error, bot] = UserSchemaObject.safeParse({
      id: 123456789,
      is_bot: true,
      first_name: 'ExampleBot',
      username: 'example_bot',
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(bot?.username, 'example_bot');
    asserts.assertEquals(bot?.can_join_groups, true);
  });

  it('accepts a minimal message-sender user', () => {
    const [error, user] = UserSchemaObject.safeParse({
      id: 42,
      is_bot: false,
      first_name: 'Ada',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(user?.first_name, 'Ada');
    asserts.assertEquals(user?.username, undefined);
  });

  it('keeps unmodeled fields via passthrough', () => {
    const [error, user] = UserSchemaObject.safeParse({
      id: 42,
      is_bot: false,
      first_name: 'Ada',
      is_premium: true,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals((user as Record<string, unknown>)?.is_premium, true);
  });

  it('rejects a user missing required fields', () => {
    asserts.assertExists(
      UserSchemaObject.safeParse({ id: 42, is_bot: false })[0],
    );
  });

  it('rejects a non-boolean is_bot', () => {
    // `Guardian.boolean()` coerces a strict allow-list of strings
    // (`'true'`/`'false'`/`'yes'`/`'no'`/…), so use a string outside that
    // list to exercise real rejection.
    asserts.assertExists(
      UserSchemaObject.safeParse({
        id: 42,
        is_bot: 'maybe',
        first_name: 'Ada',
      })[0],
    );
  });
});
