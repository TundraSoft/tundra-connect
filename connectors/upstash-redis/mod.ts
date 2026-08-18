/**
 * @module @tundraconnect/upstash-redis
 */

// Export main client class
export { UpstashRedis, type UpstashRedisOptions } from './UpstashRedis.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
