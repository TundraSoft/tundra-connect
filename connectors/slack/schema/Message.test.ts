import * as asserts from '@asserts';
import { describe, it } from '@test';
import { MessageSchemaObject } from './Message.ts';

describe('Slack.schema.Message', () => {
  it('accepts the documented fields', () => {
    const [error, message] = MessageSchemaObject.safeParse({
      type: 'message',
      ts: '1503435956.000247',
      text: "Here's a message for you",
      username: 'ecto1',
      bot_id: 'B123ABC456',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(message?.ts, '1503435956.000247');
    asserts.assertEquals(message?.bot_id, 'B123ABC456');
  });

  it('accepts a minimal message (type + ts only)', () => {
    asserts.assertEquals(
      MessageSchemaObject.safeParse({
        type: 'message',
        ts: '1512085950.000216',
      })[0],
      null,
    );
  });

  it('passes through undocumented fields', () => {
    const [error, message] = MessageSchemaObject.safeParse({
      type: 'message',
      ts: '1512085950.000216',
      blocks: [{ type: 'section' }],
    });
    asserts.assertEquals(error, null);
    // deno-lint-ignore no-explicit-any
    asserts.assertExists((message as any)?.blocks);
  });

  it('rejects a missing ts', () => {
    asserts.assertExists(
      MessageSchemaObject.safeParse({ type: 'message' })[0],
    );
  });

  it('rejects a malformed ts', () => {
    asserts.assertExists(
      MessageSchemaObject.safeParse({ type: 'message', ts: 'nope' })[0],
    );
  });

  it('rejects a missing type', () => {
    asserts.assertExists(
      MessageSchemaObject.safeParse({ ts: '1512085950.000216' })[0],
    );
  });
});
