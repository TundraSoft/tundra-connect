import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CallbackQuerySchemaObject,
  ChatMemberUpdatedSchemaObject,
  MaybeInaccessibleMessageSchemaObject,
  UPDATE_TYPES,
  UpdateSchemaObject,
} from './Update.ts';

const chat = { id: -1001234567890, type: 'supergroup', title: 'Ops' };
const user = { id: 42, is_bot: false, first_name: 'Ada', username: 'ada' };
const bot = {
  id: 7,
  is_bot: true,
  first_name: 'Brevily',
  username: 'BrevilyBot',
};
const message = {
  message_id: 10,
  date: 1735689600,
  chat,
  from: user,
  text: '/today@BrevilyBot',
  entities: [{ type: 'bot_command', offset: 0, length: 17 }],
};

describe('Telegram.schema.Update', () => {
  it('accepts a command message with its bot_command entity', () => {
    const [error, update] = UpdateSchemaObject.safeParse({
      update_id: 1,
      message,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(update?.message?.from?.id, 42);
    asserts.assertEquals(update?.message?.chat.type, 'supergroup');
    asserts.assertEquals(update?.message?.entities?.[0]?.type, 'bot_command');
  });

  it('accepts an edited message', () => {
    const [error, update] = UpdateSchemaObject.safeParse({
      update_id: 2,
      edited_message: { ...message, edit_date: 1735689700 },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(update?.edited_message?.edit_date, 1735689700);
  });

  it('accepts a callback query on an accessible message', () => {
    const [error, update] = UpdateSchemaObject.safeParse({
      update_id: 3,
      callback_query: {
        id: 'q1',
        from: user,
        chat_instance: '-998877',
        data: 'ack:17',
        message,
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(update?.callback_query?.data, 'ack:17');
  });

  it('accepts a callback query on an inaccessible message (date 0)', () => {
    const [error, query] = CallbackQuerySchemaObject.safeParse({
      id: 'q2',
      from: user,
      chat_instance: '-998877',
      data: 'ack:17',
      message: { chat, message_id: 10, date: 0 },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(query?.message?.date, 0);
  });

  it('tells an inaccessible message from a regular one', () => {
    const [, inaccessible] = MaybeInaccessibleMessageSchemaObject.safeParse({
      chat,
      message_id: 1,
      date: 0,
    });
    asserts.assertEquals(inaccessible?.date, 0);
    asserts.assertEquals(
      MaybeInaccessibleMessageSchemaObject.safeParse(message)[1]?.date,
      1735689600,
    );
  });

  it('accepts my_chat_member (the bot was blocked)', () => {
    const [error, change] = ChatMemberUpdatedSchemaObject.safeParse({
      chat: { id: 42, type: 'private', first_name: 'Ada' },
      from: user,
      date: 1735689600,
      old_chat_member: { status: 'member', user: bot },
      new_chat_member: { status: 'kicked', user: bot, until_date: 0 },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(change?.new_chat_member.status, 'kicked');
    asserts.assertEquals(
      UpdateSchemaObject.safeParse({ update_id: 4, my_chat_member: change })[0],
      null,
    );
  });

  it('passes an unknown update kind through untouched', () => {
    const [error, update] = UpdateSchemaObject.safeParse({
      update_id: 5,
      some_future_kind: { anything: [1, null, { deep: true }] },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      (update as Record<string, unknown> | undefined)?.some_future_kind,
      { anything: [1, null, { deep: true }] },
    );
  });

  it('passes a documented-but-unmodeled kind through untouched', () => {
    const [error, update] = UpdateSchemaObject.safeParse({
      update_id: 6,
      poll_answer: { poll_id: 'p', option_ids: [0] },
    });
    asserts.assertEquals(error, null);
    asserts.assertExists((update as Record<string, unknown>)?.poll_answer);
  });

  it('keeps unknown fields and unknown entity types inside a message', () => {
    const [error, update] = UpdateSchemaObject.safeParse({
      update_id: 7,
      message: {
        ...message,
        brand_new_field: 'x',
        entities: [{ type: 'brand_new_entity', offset: 0, length: 1 }],
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      (update?.message as Record<string, unknown> | undefined)
        ?.brand_new_field,
      'x',
    );
  });

  it('carries migrate_to_chat_id on a service message', () => {
    const [error, update] = UpdateSchemaObject.safeParse({
      update_id: 8,
      message: {
        message_id: 11,
        date: 1735689600,
        chat: { id: -123, type: 'group', title: 'Ops' },
        migrate_to_chat_id: -1001234567890,
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(update?.message?.migrate_to_chat_id, -1001234567890);
  });

  it('rejects a body without update_id, or with a malformed known kind', () => {
    asserts.assertExists(UpdateSchemaObject.safeParse({ message })[0]);
    asserts.assertExists(
      UpdateSchemaObject.safeParse({ update_id: 9, message: { text: 'x' } })[0],
    );
    asserts.assertExists(UpdateSchemaObject.safeParse([])[0]);
  });

  it('lists every documented update kind once', () => {
    asserts.assertEquals(new Set(UPDATE_TYPES).size, UPDATE_TYPES.length);
    asserts.assert(UPDATE_TYPES.includes('callback_query'));
  });
});
