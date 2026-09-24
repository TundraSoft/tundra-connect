import * as asserts from '@asserts';
import { describe, it } from '@test';
import { GuardianError } from '@guardian';
import { envArgs } from '@utils';
import { UpstashRedis } from './UpstashRedis.ts';
import { UpstashRedisError } from './errors/mod.ts';

class MockUpstashRedis extends UpstashRedis {
  public request?: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit;
  };
  public requests: Array<{
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit;
  }> = [];
  private responseBody: BodyInit | null = null;
  private responseStatus = 200;
  private responseHeaders: Record<string, string> = {
    'content-type': 'application/json',
  };

  /** The most recent request's parsed JSON body, as a command array. */
  get sentCommand(): unknown {
    return this.request?.body
      ? JSON.parse(String(this.request.body))
      : undefined;
  }

  setResponse(
    body: BodyInit | null,
    status = 200,
    headers: Record<string, string> = { 'content-type': 'application/json' },
  ): void {
    this.responseBody = body;
    this.responseStatus = status;
    this.responseHeaders = headers;
    this._fetch = (input, init) => {
      const entry = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: init?.body ?? undefined,
      };
      this.request = entry;
      this.requests.push(entry);
      return Promise.resolve(
        new Response(this.responseBody, {
          status: this.responseStatus,
          headers: this.responseHeaders,
        }),
      );
    };
  }
}

const client = () =>
  new MockUpstashRedis({
    auth: { type: 'BEARER', token: 'test-token', prefix: 'Bearer' },
    baseURL: 'https://us1-merry-cat-32748.upstash.io',
  });

const jsonResult = (result: unknown) => JSON.stringify({ result });

describe('UpstashRedis', () => {
  describe('configuration', () => {
    it('constructs with the required auth option', () => {
      const c = client();
      asserts.assertEquals(c.vendor, 'UpstashRedis');
    });

    it('rejects a blank Bearer token', () => {
      asserts.assertThrows(
        () =>
          new MockUpstashRedis({
            auth: { type: 'BEARER', token: '', prefix: 'Bearer' },
            baseURL: 'https://us1-merry-cat-32748.upstash.io',
          }),
        UpstashRedisError,
        'non-empty string',
      );
      asserts.assertThrows(
        () =>
          new MockUpstashRedis({
            auth: { type: 'BEARER', token: '   ', prefix: 'Bearer' },
            baseURL: 'https://us1-merry-cat-32748.upstash.io',
          }),
        UpstashRedisError,
        'non-empty string',
      );
    });

    it('rejects a completely missing auth option', () => {
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () =>
          new MockUpstashRedis(
            { baseURL: 'https://us1-merry-cat-32748.upstash.io' } as any,
          ),
        UpstashRedisError,
        'non-empty string',
      );
    });

    it('rejects an auth config that is not a Bearer token', () => {
      asserts.assertThrows(
        () =>
          new MockUpstashRedis({
            // deno-lint-ignore no-explicit-any
            auth: { type: 'BASIC', username: 'x', password: 'y' } as any,
            baseURL: 'https://us1-merry-cat-32748.upstash.io',
          }),
        UpstashRedisError,
        'non-empty string',
      );
    });

    it('never leaks a malformed auth value into a thrown config error', () => {
      const secretLookingToken = 'super-secret-value-that-must-not-leak';
      let caught: UpstashRedisError | undefined;
      try {
        new MockUpstashRedis({
          // `type: 'BASIC'` is not a shape UpstashRedis supports — fails
          // validation just like a blank/missing token would — while
          // still carrying a secret-looking value in `password`, to
          // prove it never surfaces on the thrown error.
          auth: {
            type: 'BASIC',
            username: 'x',
            password: secretLookingToken,
            // deno-lint-ignore no-explicit-any
          } as any,
          baseURL: 'https://us1-merry-cat-32748.upstash.io',
        });
      } catch (err) {
        caught = err as UpstashRedisError;
      }
      asserts.assertExists(caught);
      asserts.assertEquals(
        caught?.message.includes(secretLookingToken),
        false,
      );
      asserts.assertEquals(
        JSON.stringify(caught?.toJSON()).includes(secretLookingToken),
        false,
      );
    });

    it('sends the configured token as a Bearer Authorization header', async () => {
      const c = client();
      c.setResponse(jsonResult(null));
      await c.get('foo');
      const headers = c.request?.headers as Record<string, string>;
      asserts.assertEquals(headers['Authorization'], 'Bearer test-token');
      asserts.assertEquals(c.request?.method, 'POST');
      asserts.assertStringIncludes(
        c.request?.url ?? '',
        'https://us1-merry-cat-32748.upstash.io',
      );
    });
  });

  describe('GET/SET', () => {
    it('GET returns the stored value', async () => {
      const c = client();
      c.setResponse(jsonResult('bar'));
      const value = await c.get('foo');
      asserts.assertEquals(value, 'bar');
      asserts.assertEquals(c.sentCommand, ['GET', 'foo']);
    });

    it('GET returns null for a missing key', async () => {
      const c = client();
      c.setResponse(jsonResult(null));
      const value = await c.get('missing');
      asserts.assertEquals(value, null);
    });

    it('SET sends a plain command and returns OK', async () => {
      const c = client();
      c.setResponse(jsonResult('OK'));
      const result = await c.set('foo', 'bar');
      asserts.assertEquals(result, 'OK');
      asserts.assertEquals(c.sentCommand, ['SET', 'foo', 'bar']);
    });

    it('SET with `ex` appends EX to the command array', async () => {
      const c = client();
      c.setResponse(jsonResult('OK'));
      await c.set('foo', 'bar', { ex: 100 });
      asserts.assertEquals(c.sentCommand, ['SET', 'foo', 'bar', 'EX', 100]);
    });

    it('SET with `px` appends PX to the command array', async () => {
      const c = client();
      c.setResponse(jsonResult('OK'));
      await c.set('foo', 'bar', { px: 100000 });
      asserts.assertEquals(c.sentCommand, ['SET', 'foo', 'bar', 'PX', 100000]);
    });

    it('SET with `nx` appends NX and can return null when the condition is not met', async () => {
      const c = client();
      c.setResponse(jsonResult(null));
      const result = await c.set('foo', 'bar', { nx: true });
      asserts.assertEquals(result, null);
      asserts.assertEquals(c.sentCommand, ['SET', 'foo', 'bar', 'NX']);
    });

    it('SET with `xx` appends XX', async () => {
      const c = client();
      c.setResponse(jsonResult('OK'));
      await c.set('foo', 'bar', { xx: true });
      asserts.assertEquals(c.sentCommand, ['SET', 'foo', 'bar', 'XX']);
    });

    it('rejects SET with both ex and px — pins the async-rejection contract', async () => {
      const c = client();
      c.setResponse(jsonResult('OK'));
      const error = await asserts.assertRejects(
        () => c.set('foo', 'bar', { ex: 10, px: 10000 }),
        UpstashRedisError,
        'mutually exclusive',
      );
      asserts.assertEquals(error.code, 'INVALID_REQUEST');
      // Never actually sent — rejected before any request was made.
      asserts.assertEquals(c.request, undefined);
    });

    it('rejects SET with both nx and xx — pins the async-rejection contract', async () => {
      const c = client();
      c.setResponse(jsonResult('OK'));
      const error = await asserts.assertRejects(
        () => c.set('foo', 'bar', { nx: true, xx: true }),
        UpstashRedisError,
        'mutually exclusive',
      );
      asserts.assertEquals(error.code, 'INVALID_REQUEST');
      asserts.assertEquals(c.request, undefined);
    });
  });

  describe('DEL/EXISTS', () => {
    it('DEL accepts a single key', async () => {
      const c = client();
      c.setResponse(jsonResult(1));
      const removed = await c.del('foo');
      asserts.assertEquals(removed, 1);
      asserts.assertEquals(c.sentCommand, ['DEL', 'foo']);
    });

    it('DEL accepts an array of keys', async () => {
      const c = client();
      c.setResponse(jsonResult(2));
      const removed = await c.del(['foo', 'bar']);
      asserts.assertEquals(removed, 2);
      asserts.assertEquals(c.sentCommand, ['DEL', 'foo', 'bar']);
    });

    it('rejects DEL with an empty key array', async () => {
      const c = client();
      c.setResponse(jsonResult(0));
      const error = await asserts.assertRejects(
        () => c.del([]),
        UpstashRedisError,
      );
      asserts.assertEquals(error.code, 'INVALID_REQUEST');
      asserts.assertEquals(c.request, undefined);
    });

    it('EXISTS counts how many of the given keys exist', async () => {
      const c = client();
      c.setResponse(jsonResult(1));
      const count = await c.exists(['foo', 'missing']);
      asserts.assertEquals(count, 1);
      asserts.assertEquals(c.sentCommand, ['EXISTS', 'foo', 'missing']);
    });
  });

  describe('EXPIRE/INCR/INCRBY', () => {
    it('EXPIRE sets a TTL', async () => {
      const c = client();
      c.setResponse(jsonResult(1));
      const set = await c.expire('foo', 60);
      asserts.assertEquals(set, 1);
      asserts.assertEquals(c.sentCommand, ['EXPIRE', 'foo', 60]);
    });

    it('INCR increments by 1', async () => {
      const c = client();
      c.setResponse(jsonResult(6));
      const value = await c.incr('counter');
      asserts.assertEquals(value, 6);
      asserts.assertEquals(c.sentCommand, ['INCR', 'counter']);
    });

    it('INCRBY increments by the given amount', async () => {
      const c = client();
      c.setResponse(jsonResult(15));
      const value = await c.incrby('counter', 10);
      asserts.assertEquals(value, 15);
      asserts.assertEquals(c.sentCommand, ['INCRBY', 'counter', 10]);
    });
  });

  describe('HGET/HSET', () => {
    it('HGET returns a field value', async () => {
      const c = client();
      c.setResponse(jsonResult('100000'));
      const value = await c.hget('employee:1', 'salary');
      asserts.assertEquals(value, '100000');
      asserts.assertEquals(c.sentCommand, ['HGET', 'employee:1', 'salary']);
    });

    it('HGET returns null for a missing field', async () => {
      const c = client();
      c.setResponse(jsonResult(null));
      asserts.assertEquals(await c.hget('employee:1', 'missing'), null);
    });

    it('HSET flattens a field-value record into a variadic command', async () => {
      const c = client();
      c.setResponse(jsonResult(2));
      const added = await c.hset('employee:1', {
        name: 'Ada',
        salary: 100000,
      });
      asserts.assertEquals(added, 2);
      asserts.assertEquals(c.sentCommand, [
        'HSET',
        'employee:1',
        'name',
        'Ada',
        'salary',
        100000,
      ]);
    });

    it('rejects HSET with no fields', async () => {
      const c = client();
      c.setResponse(jsonResult(0));
      const error = await asserts.assertRejects(
        () => c.hset('employee:1', {}),
        UpstashRedisError,
      );
      asserts.assertEquals(error.code, 'INVALID_REQUEST');
      asserts.assertEquals(c.request, undefined);
    });
  });

  describe('LPUSH/RPUSH/LRANGE', () => {
    it('LPUSH prepends values and returns the new length', async () => {
      const c = client();
      c.setResponse(jsonResult(2));
      const length = await c.lpush('list-key', 'value1', 'value2');
      asserts.assertEquals(length, 2);
      asserts.assertEquals(c.sentCommand, [
        'LPUSH',
        'list-key',
        'value1',
        'value2',
      ]);
    });

    it('RPUSH appends values and returns the new length', async () => {
      const c = client();
      c.setResponse(jsonResult(2));
      const length = await c.rpush('list-key', 'value1', 'value2');
      asserts.assertEquals(length, 2);
      asserts.assertEquals(c.sentCommand, [
        'RPUSH',
        'list-key',
        'value1',
        'value2',
      ]);
    });

    it('rejects LPUSH/RPUSH with no values', async () => {
      const c = client();
      c.setResponse(jsonResult(0));
      await asserts.assertRejects(() => c.lpush('list-key'), UpstashRedisError);
      await asserts.assertRejects(() => c.rpush('list-key'), UpstashRedisError);
      asserts.assertEquals(c.request, undefined);
    });

    it('LRANGE reads a range of list elements', async () => {
      const c = client();
      c.setResponse(jsonResult(['value1', 'value2']));
      const values = await c.lrange('list-key', 0, -1);
      asserts.assertEquals(values, ['value1', 'value2']);
      asserts.assertEquals(c.sentCommand, ['LRANGE', 'list-key', 0, -1]);
    });
  });

  describe('pipeline', () => {
    it('sends every command to /pipeline and preserves response order, mixing success and error', async () => {
      const c = client();
      c.setResponse(
        JSON.stringify([
          { result: 'OK' },
          { result: 'bar' },
          { error: "ERR wrong number of arguments for 'get' command" },
        ]),
      );
      const results = await c.pipeline([
        ['SET', 'foo', 'bar'],
        ['GET', 'foo'],
        ['GET'],
      ]);
      asserts.assertEquals(results, [
        { result: 'OK' },
        { result: 'bar' },
        { error: "ERR wrong number of arguments for 'get' command" },
      ]);
      asserts.assertStringIncludes(c.request?.url ?? '', '/pipeline');
      asserts.assertEquals(c.sentCommand, [
        ['SET', 'foo', 'bar'],
        ['GET', 'foo'],
        ['GET'],
      ]);
    });

    it('rejects an empty pipeline before sending anything', async () => {
      const c = client();
      c.setResponse(JSON.stringify([]));
      const error = await asserts.assertRejects(
        () => c.pipeline([]),
        UpstashRedisError,
      );
      asserts.assertEquals(error.code, 'REQUEST_VALIDATION_ERROR');
      asserts.assertInstanceOf(error.cause, GuardianError);
      asserts.assertEquals(c.request, undefined);
    });
  });

  describe('execute (low-level escape hatch)', () => {
    it('sends an arbitrary command and returns its raw result', async () => {
      const c = client();
      c.setResponse(jsonResult(42));
      const size = await c.execute(['DBSIZE']);
      asserts.assertEquals(size, 42);
      asserts.assertEquals(c.sentCommand, ['DBSIZE']);
    });

    it('rejects a malformed command before sending anything', async () => {
      const c = client();
      c.setResponse(jsonResult(0));
      const error = await asserts.assertRejects(
        () => c.execute([]),
        UpstashRedisError,
      );
      asserts.assertEquals(error.code, 'REQUEST_VALIDATION_ERROR');
      asserts.assertInstanceOf(error.cause, GuardianError);
      asserts.assertEquals(c.request, undefined);
    });
  });

  describe('error mapping', () => {
    it('maps a Redis-level command error (HTTP 400) to COMMAND_ERROR, carrying the vendor message', async () => {
      const c = client();
      c.setResponse(
        JSON.stringify({
          error: "ERR wrong number of arguments for 'get' command",
        }),
        400,
      );
      const error = await asserts.assertRejects(
        () => c.get('foo'),
        UpstashRedisError,
      );
      asserts.assertEquals(error.code, 'COMMAND_ERROR');
      asserts.assertEquals(
        error.getContextValue('reason'),
        "ERR wrong number of arguments for 'get' command",
      );
    });

    it('maps HTTP 401 to AUTH_FAILED', async () => {
      const c = client();
      c.setResponse(
        JSON.stringify({ error: 'WRONGPASS invalid password' }),
        401,
      );
      const error = await asserts.assertRejects(
        () => c.get('foo'),
        UpstashRedisError,
      );
      asserts.assertEquals(error.code, 'AUTH_FAILED');
    });

    it('maps HTTP 405 to METHOD_NOT_ALLOWED', async () => {
      const c = client();
      c.setResponse('', 405);
      const error = await asserts.assertRejects(
        () => c.get('foo'),
        UpstashRedisError,
      );
      asserts.assertEquals(error.code, 'METHOD_NOT_ALLOWED');
    });

    it('maps a 5xx response to SERVICE_UNAVAILABLE', async () => {
      const c = client();
      c.setResponse('<html>Internal Server Error</html>', 500, {
        'content-type': 'text/html',
      });
      const error = await asserts.assertRejects(
        () => c.get('foo'),
        UpstashRedisError,
      );
      asserts.assertEquals(error.code, 'SERVICE_UNAVAILABLE');
    });

    it('falls back to UNKNOWN_ERROR for an unmapped status', async () => {
      const c = client();
      c.setResponse('teapot', 418);
      const error = await asserts.assertRejects(
        () => c.get('foo'),
        UpstashRedisError,
      );
      asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
    });

    it('raises RESPONSE_ERROR when a 200 body fails schema validation', async () => {
      const c = client();
      c.setResponse(JSON.stringify({ result: { unexpected: 'shape' } }));
      const error = await asserts.assertRejects(
        () => c.get('foo'),
        UpstashRedisError,
      );
      asserts.assertEquals(error.code, 'RESPONSE_ERROR');
    });

    it('never leaks the configured token into a mapped vendor error', async () => {
      const c = new MockUpstashRedis({
        auth: {
          type: 'BEARER',
          token: 'super-secret-value-that-must-not-leak',
          prefix: 'Bearer',
        },
        baseURL: 'https://us1-merry-cat-32748.upstash.io',
      });
      c.setResponse(
        JSON.stringify({ error: 'WRONGPASS invalid password' }),
        401,
      );
      let caught: UpstashRedisError | undefined;
      try {
        await c.get('foo');
      } catch (err) {
        caught = err as UpstashRedisError;
      }
      asserts.assertExists(caught);
      asserts.assertEquals(
        caught?.message.includes('super-secret-value-that-must-not-leak'),
        false,
      );
      asserts.assertEquals(
        JSON.stringify(caught?.toJSON()).includes(
          'super-secret-value-that-must-not-leak',
        ),
        false,
      );
    });
  });
});

// =============================================================================
// Live tests — run only when real Upstash Redis credentials are present in
// the environment. Skipped (not failed) otherwise, and on Bun/Node
// regardless of credentials — this suite is Deno-only.
// =============================================================================

const clientFor = client;

describe('UpstashRedis — rate limiting', () => {
  it('classifies a 429 as RATE_LIMITED (not UNKNOWN_ERROR) and carries the retry hint', async () => {
    const client = clientFor();
    client.setResponse(JSON.stringify({ error: 'rate limited' }), 429, {
      'content-type': 'application/json',
      'retry-after': '5',
    });
    const err = await asserts.assertRejects(
      () => client.get('k'),
      UpstashRedisError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 5);
  });
});

const env = envArgs();
const credentials = {
  token: env.get('CONNECTOR_UPSTASH_REDIS_TOKEN'),
  baseURL: env.get('CONNECTOR_UPSTASH_REDIS_BASE_URL'),
};
const liveTestsEnabled = !!credentials.token && !!credentials.baseURL;

describe('UpstashRedis — maxRetryWait (RESTler rate-limit retry)', () => {
  /**
   * A client whose every request is answered 429 with a `retry-after` hint,
   * and whose waits are recorded instead of slept. `maxRetryWait` is what
   * routes a 429 to RESTler's retry logic (and so to this connect's
   * `RESTlerRateLimitError` rewrap) — without it the vendor handler maps the
   * 429 directly, which the error-mapping tests already cover.
   */
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockUpstashRedis({
      auth: { type: 'BEARER', token: 'test-token', prefix: 'Bearer' },
      baseURL: 'https://us1-merry-cat-32748.upstash.io',
      maxRetryWait,
    });
    const slept: number[] = [];
    let calls = 0;
    c['_sleep'] = (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    };
    c['_fetch'] = (input) => {
      calls++;
      return Promise.resolve(
        new Response('{}', {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': retryAfter,
          },
        }),
      );
    };
    return { c, slept, calls: () => calls };
  };

  it('waits the hinted time, retries once, then surfaces RATE_LIMITED with retried: true', async () => {
    const { c, slept, calls } = throttled(60, '1');
    const err = await asserts.assertRejects(
      () => c.get('foo'),
      UpstashRedisError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 1);
    asserts.assertEquals(slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws RATE_LIMITED immediately with retried: false when the hint exceeds maxRetryWait', async () => {
    const { c, slept, calls } = throttled(5, '120');
    const err = await asserts.assertRejects(
      () => c.get('foo'),
      UpstashRedisError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

describe({
  name: 'UpstashRedis — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('sets and gets a real key against the live database, then cleans up', async () => {
      const client = new UpstashRedis({
        auth: { type: 'BEARER', token: credentials.token!, prefix: 'Bearer' },
        baseURL: credentials.baseURL!,
      });
      const key = `tundra-connect-live-test-${Date.now()}`;
      try {
        await client.set(key, 'live-test-value');
        const value = await client.get(key);
        asserts.assertEquals(value, 'live-test-value');
      } finally {
        await client.del(key);
      }
    });
  },
});
