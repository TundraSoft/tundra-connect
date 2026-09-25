import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link IntegerResultSchemaObject}.
 *
 * Hand-written directly (no `GuardianInfer<typeof _internal>` hop) — see
 * {@link ErrorSchema} for the full reasoning.
 */
export type IntegerResultSchema = {
  /** The integer reply. */
  result: number;
};

/**
 * Schema for UpstashRedis's success envelope for a command that returns an
 * integer — `DEL`, `EXISTS`, `INCR`, `INCRBY`, `EXPIRE`, `HSET`, `LPUSH`,
 * `RPUSH`.
 *
 * @example
 * ```typescript
 * import { IntegerResultSchemaObject } from '@tundraconnect/upstash-redis/schemas';
 *
 * const [error, body] = IntegerResultSchemaObject.safeParse({ result: 1 });
 * ```
 */
export const IntegerResultSchemaObject: BaseGuardian<IntegerResultSchema> =
  Guardian.object({
    /** The integer reply. */
    result: Guardian.number().integer(),
  }).describe({
    title: 'Integer result',
    description:
      'UpstashRedis success envelope for a command that returns an integer (DEL, EXISTS, INCR, INCRBY, EXPIRE, HSET, LPUSH, RPUSH).',
  });
