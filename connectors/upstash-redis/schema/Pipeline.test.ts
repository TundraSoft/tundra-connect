import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  PipelineRequestSchemaObject,
  PipelineResponseSchemaObject,
  PipelineResultSchemaObject,
} from './Pipeline.ts';

describe('UpstashRedis.schema.PipelineRequest', () => {
  it('accepts an array of command arrays', () => {
    const [error, body] = PipelineRequestSchemaObject.safeParse([
      ['SET', 'foo', 'bar'],
      ['GET', 'foo'],
    ]);
    asserts.assertEquals(error, null);
    asserts.assertEquals(body, [['SET', 'foo', 'bar'], ['GET', 'foo']]);
  });

  it('accepts a single-command pipeline', () => {
    asserts.assertEquals(
      PipelineRequestSchemaObject.safeParse([['DBSIZE']])[0],
      null,
    );
  });

  it('accepts commands mixing strings and numbers', () => {
    asserts.assertEquals(
      PipelineRequestSchemaObject.safeParse([['SET', 'k', 'v', 'EX', 100]])[0],
      null,
    );
  });

  it('rejects an empty pipeline', () => {
    asserts.assertExists(PipelineRequestSchemaObject.safeParse([])[0]);
  });

  it('rejects a pipeline containing an empty command array', () => {
    asserts.assertExists(PipelineRequestSchemaObject.safeParse([[]])[0]);
  });

  it('rejects a pipeline whose entry is not a command array', () => {
    asserts.assertExists(
      PipelineRequestSchemaObject.safeParse(['GET foo'])[0],
    );
  });

  it('rejects a command whose first element is not a string', () => {
    asserts.assertExists(
      PipelineRequestSchemaObject.safeParse([[1, 'foo']])[0],
    );
  });

  it('rejects a non-array value', () => {
    asserts.assertExists(PipelineRequestSchemaObject.safeParse('GET foo')[0]);
  });
});

describe('UpstashRedis.schema.PipelineResult', () => {
  it('accepts a success entry', () => {
    const [error, entry] = PipelineResultSchemaObject.safeParse({
      result: 'OK',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(entry, { result: 'OK' });
  });

  it('accepts a null result — GET on a missing key', () => {
    asserts.assertEquals(
      PipelineResultSchemaObject.safeParse({ result: null })[0],
      null,
    );
  });

  it('accepts a non-primitive result — LRANGE returns an array', () => {
    asserts.assertEquals(
      PipelineResultSchemaObject.safeParse({ result: ['a', 'b'] })[0],
      null,
    );
  });

  it('accepts an error entry', () => {
    const [error, entry] = PipelineResultSchemaObject.safeParse({
      error: "ERR wrong number of arguments for 'get' command",
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(entry, {
      error: "ERR wrong number of arguments for 'get' command",
    });
  });

  it('coerces a numeric error to a string — same coercible-primitive rule as ./Error.ts', () => {
    const [error, entry] = PipelineResultSchemaObject.safeParse({ error: 500 });
    asserts.assertEquals(error, null);
    asserts.assertEquals(entry, { error: '500' });
  });

  it('rejects an error that is not a coercible primitive', () => {
    asserts.assertExists(
      PipelineResultSchemaObject.safeParse({ error: { code: 1 } })[0],
    );
  });

  it('rejects an entry that is neither a result nor an error', () => {
    asserts.assertExists(
      PipelineResultSchemaObject.safeParse({ totally: 'unrelated' })[0],
    );
  });

  it('rejects an empty object — `result` is absent, not optional, on the wire', () => {
    asserts.assertExists(PipelineResultSchemaObject.safeParse({})[0]);
  });

  it('rejects a non-object entry', () => {
    asserts.assertExists(PipelineResultSchemaObject.safeParse('OK')[0]);
  });
});

describe('UpstashRedis.schema.PipelineResponse', () => {
  it('accepts a response mixing success and error entries, preserving order', () => {
    const [error, body] = PipelineResponseSchemaObject.safeParse([
      { result: 'OK' },
      { error: "ERR wrong number of arguments for 'get' command" },
      { result: null },
    ]);
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.length, 3);
    asserts.assertEquals(body?.[0], { result: 'OK' });
    asserts.assertEquals(body?.[2], { result: null });
  });

  it('accepts an empty response array', () => {
    asserts.assertEquals(PipelineResponseSchemaObject.safeParse([])[0], null);
  });

  it('rejects a response containing a malformed entry', () => {
    asserts.assertExists(
      PipelineResponseSchemaObject.safeParse([{ result: 'OK' }, 'nope'])[0],
    );
  });

  it('rejects a non-array response', () => {
    asserts.assertExists(
      PipelineResponseSchemaObject.safeParse({ result: 'OK' })[0],
    );
  });
});
