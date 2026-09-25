/**
 * A typed client for the [Upstash Redis REST
 * API](https://upstash.com/docs/redis/features/restapi) —
 * Redis over plain HTTPS, no TCP client or connection pool required. Covers
 * `GET`/`SET`/`DEL`/`EXISTS`/`EXPIRE`/`INCR`/`INCRBY`, hash (`HGET`/`HSET`)
 * and list (`LPUSH`/`RPUSH`/`LRANGE`) commands, request-level pipelining, and
 * a low-level `execute()` escape hatch for anything not otherwise typed.
 *
 * Typed Upstash Redis REST client: string, hash and list commands, TTLs,
 * counters and pipelining over plain HTTPS — no TCP connection needed.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`UpstashRedisError` and its code registry).
 *
 * @example
 * ```ts
 * import { UpstashRedis } from '@tundraconnect/upstash-redis';
 *
 * const client = new UpstashRedis({
 *   auth: { type: 'BEARER', token: 'AAAAA...', prefix: 'Bearer' },
 *   baseURL: 'https://us1-merry-cat-32748.upstash.io',
 * });
 *
 * // Set a key with a 60-second expiry, then read it back.
 * await client.set('foo', 'bar', { ex: 60 });
 * const value = await client.get('foo'); // 'bar'
 *
 * // Hashes and lists work the same way.
 * await client.hset('employee:1', { name: 'Ada', salary: 100000 });
 * await client.rpush('queue', 'job-1', 'job-2');
 *
 * // Batch several commands in one round trip (not atomic — see the API docs).
 * const results = await client.pipeline([
 *   ['INCR', 'visits'],
 *   ['GET', 'foo'],
 * ]);
 * ```
 *
 * @module
 */

// Export main client class
export {
  UpstashRedis,
  type UpstashRedisAuth,
  type UpstashRedisOptions,
  type UpstashRedisSetOptions,
} from './UpstashRedis.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
