import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  BotCommandListSchemaObject,
  BotCommandSchemaObject,
  BotCommandScopeSchemaObject,
  DeleteMyCommandsRequestSchemaObject,
  GetMyCommandsRequestSchemaObject,
  SetMyCommandsRequestSchemaObject,
} from './BotCommand.ts';

const command = (name: string, description = 'Does a thing') =>
  BotCommandSchemaObject.safeParse({ command: name, description });

describe('Telegram.schema.BotCommand', () => {
  describe('BotCommandSchemaObject', () => {
    it('accepts lowercase letters, digits and underscores', () => {
      asserts.assertEquals(command('status')[0], null);
      asserts.assertEquals(command('top_10')[0], null);
      asserts.assertEquals(command('a'.repeat(32))[0], null);
    });

    it('rejects uppercase, a leading slash, a hyphen, empty and 33 characters', () => {
      for (const name of ['Status', '/status', 'top-10', '', 'a'.repeat(33)]) {
        asserts.assertExists(command(name)[0], name);
      }
    });

    it('enforces a 1-256 character description', () => {
      asserts.assertEquals(command('help', 'd'.repeat(256))[0], null);
      asserts.assertExists(command('help', 'd'.repeat(257))[0]);
      asserts.assertExists(command('help', '')[0]);
    });
  });

  describe('BotCommandScopeSchemaObject', () => {
    it('accepts every documented scope', () => {
      for (
        const scope of [
          { type: 'default' },
          { type: 'all_private_chats' },
          { type: 'all_group_chats' },
          { type: 'all_chat_administrators' },
          { type: 'chat', chat_id: -1001234567890 },
          { type: 'chat_administrators', chat_id: '@examplegroup' },
          { type: 'chat_member', chat_id: -1001234567890, user_id: 42 },
        ]
      ) {
        const [error, value] = BotCommandScopeSchemaObject.safeParse(scope);
        asserts.assertEquals(error, null, scope.type);
        asserts.assertEquals(value?.type, scope.type);
      }
    });

    it('rejects an unknown type', () => {
      const [error] = BotCommandScopeSchemaObject.safeParse({
        type: 'all_channels',
      });
      asserts.assertExists(error);
    });

    it('rejects a chat scope without chat_id, and chat_member without user_id', () => {
      asserts.assertExists(
        BotCommandScopeSchemaObject.safeParse({ type: 'chat' })[0],
      );
      asserts.assertExists(
        BotCommandScopeSchemaObject.safeParse({
          type: 'chat_member',
          chat_id: 1,
        })[0],
      );
    });

    it('rejects a field that belongs to another scope', () => {
      asserts.assertExists(
        BotCommandScopeSchemaObject.safeParse({
          type: 'default',
          chat_id: 1,
        })[0],
      );
    });
  });

  describe('SetMyCommandsRequestSchemaObject', () => {
    const commands = [{ command: 'status', description: 'Service status' }];

    it('accepts commands with a scope and language', () => {
      asserts.assertEquals(
        SetMyCommandsRequestSchemaObject.safeParse({
          commands,
          scope: { type: 'all_private_chats' },
          language_code: 'en',
        })[0],
        null,
      );
    });

    it('accepts 100 commands and rejects 101', () => {
      const many = (n: number) =>
        Array.from({ length: n }, (_, i) => ({
          command: `c${i}`,
          description: 'x',
        }));
      asserts.assertEquals(
        SetMyCommandsRequestSchemaObject.safeParse({ commands: many(100) })[0],
        null,
      );
      asserts.assertExists(
        SetMyCommandsRequestSchemaObject.safeParse({ commands: many(101) })[0],
      );
    });

    it('rejects a language code that is not two lowercase letters', () => {
      asserts.assertExists(
        SetMyCommandsRequestSchemaObject.safeParse({
          commands,
          language_code: 'en-US',
        })[0],
      );
      asserts.assertEquals(
        SetMyCommandsRequestSchemaObject.safeParse({
          commands,
          language_code: '',
        })[0],
        null,
      );
    });
  });

  describe('Get/DeleteMyCommandsRequestSchemaObject', () => {
    it('accept an empty body or a scope', () => {
      for (
        const schema of [
          GetMyCommandsRequestSchemaObject,
          DeleteMyCommandsRequestSchemaObject,
        ]
      ) {
        asserts.assertEquals(schema.safeParse({})[0], null);
        asserts.assertEquals(
          schema.safeParse({ scope: { type: 'all_group_chats' } })[0],
          null,
        );
        asserts.assertExists(schema.safeParse({ commands: [] })[0]);
      }
    });
  });

  describe('BotCommandListSchemaObject', () => {
    it('accepts what getMyCommands returns, keeping unknown fields', () => {
      const [error, list] = BotCommandListSchemaObject.safeParse([
        { command: 'status', description: 'Service status', future: 1 },
      ]);
      asserts.assertEquals(error, null);
      asserts.assertEquals(
        (list?.[0] as Record<string, unknown> | undefined)?.future,
        1,
      );
      asserts.assertEquals(BotCommandListSchemaObject.safeParse([])[0], null);
    });
  });
});
