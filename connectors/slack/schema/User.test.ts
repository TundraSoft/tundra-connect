import * as asserts from '@asserts';
import { describe, it } from '@test';
import { SlackUserSchemaObject } from './User.ts';

describe('Slack.schema.User', () => {
  it('accepts the minimal required fields', () => {
    asserts.assertEquals(
      SlackUserSchemaObject.safeParse({ id: 'U123ABC456', name: 'ada' })[0],
      null,
    );
  });

  it('accepts a fully-populated user with profile', () => {
    const [error, user] = SlackUserSchemaObject.safeParse({
      id: 'U123ABC456',
      team_id: 'T123ABC',
      name: 'ada',
      real_name: 'Ada Lovelace',
      is_bot: false,
      profile: {
        email: 'ada@example.com',
        image_192: 'https://example.com/a.png',
        status_text: 'Working on the analytical engine',
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(user?.profile?.email, 'ada@example.com');
  });

  it('passes through undocumented fields', () => {
    const [error, user] = SlackUserSchemaObject.safeParse({
      id: 'U1',
      name: 'ada',
      is_admin: true,
    });
    asserts.assertEquals(error, null);
    // deno-lint-ignore no-explicit-any
    asserts.assertEquals((user as any)?.is_admin, true);
  });

  it('rejects a user missing id', () => {
    asserts.assertExists(SlackUserSchemaObject.safeParse({ name: 'ada' })[0]);
  });

  it('rejects a user missing name', () => {
    asserts.assertExists(
      SlackUserSchemaObject.safeParse({ id: 'U123ABC456' })[0],
    );
  });
});
