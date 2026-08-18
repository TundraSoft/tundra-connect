import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CommandSchemaObject } from './Command.ts';

describe('UpstashRedis.schema.Command', () => {
  it('accepts a simple command array', () => {
    const [error, command] = CommandSchemaObject.safeParse(['GET', 'foo']);
    asserts.assertEquals(error, null);
    asserts.assertEquals(command, ['GET', 'foo']);
  });

  it('accepts a command array mixing strings and numbers', () => {
    asserts.assertEquals(
      CommandSchemaObject.safeParse(['SET', 'foo', 'bar', 'EX', 100])[0],
      null,
    );
  });

  it('accepts a command with no arguments', () => {
    asserts.assertEquals(CommandSchemaObject.safeParse(['DBSIZE'])[0], null);
  });

  it('rejects an empty array', () => {
    asserts.assertExists(CommandSchemaObject.safeParse([])[0]);
  });

  it('rejects a command array whose first element is not a string', () => {
    asserts.assertExists(CommandSchemaObject.safeParse([1, 'foo'])[0]);
  });

  it('rejects a command array whose first element is a blank string', () => {
    asserts.assertExists(CommandSchemaObject.safeParse(['  ', 'foo'])[0]);
  });

  it('rejects a command array containing a non-string/number element', () => {
    asserts.assertExists(
      CommandSchemaObject.safeParse(['SET', 'foo', true])[0],
    );
  });

  it('rejects a non-array value', () => {
    asserts.assertExists(CommandSchemaObject.safeParse('GET foo')[0]);
  });
});
