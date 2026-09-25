import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ChannelSchemaObject } from './Channel.ts';

describe('Slack.schema.Channel', () => {
  it('accepts a minimal channel (id only)', () => {
    asserts.assertEquals(
      ChannelSchemaObject.safeParse({ id: 'C123ABC456' })[0],
      null,
    );
  });

  it('accepts a fully-populated channel', () => {
    const [error, channel] = ChannelSchemaObject.safeParse({
      id: 'C123ABC456',
      name: 'general',
      is_channel: true,
      is_group: false,
      is_im: false,
      is_private: false,
      is_archived: false,
      is_general: true,
      is_member: true,
      created: 1466025154,
      creator: 'U123ABC456',
      num_members: 42,
      topic: {
        value: 'Company-wide announcements',
        creator: 'U123ABC456',
        last_set: 1466025154,
      },
      purpose: { value: 'This channel is for team-wide communication' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(channel?.name, 'general');
    asserts.assertEquals(channel?.topic?.value, 'Company-wide announcements');
  });

  it('passes through undocumented fields', () => {
    const [error, channel] = ChannelSchemaObject.safeParse({
      id: 'C1',
      is_shared: true,
    });
    asserts.assertEquals(error, null);
    // deno-lint-ignore no-explicit-any
    asserts.assertEquals((channel as any)?.is_shared, true);
  });

  it('rejects a channel missing id', () => {
    asserts.assertExists(ChannelSchemaObject.safeParse({ name: 'general' })[0]);
  });
});
