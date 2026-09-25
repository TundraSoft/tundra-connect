import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link StringResultSchemaObject}.
 *
 * Hand-written directly (no `GuardianInfer<typeof _internal>` hop) — see
 * {@link ErrorSchema} for the full reasoning.
 */
export type StringResultSchema = {
  /** The bulk-string reply, or `null` when the key/field does not exist. */
  result: string | null;
};

/**
 * Schema for UpstashRedis's success envelope for a command that returns a
 * single bulk string, or `null` when the key/field doesn't exist — `GET`
 * and `HGET`.
 *
 * @example
 * ```typescript
 * import { StringResultSchemaObject } from '@tundraconnect/upstash-redis/schemas';
 *
 * const [error, body] = StringResultSchemaObject.safeParse({ result: null });
 * ```
 */
export const StringResultSchemaObject: BaseGuardian<StringResultSchema> =
  Guardian.object({
    /** The bulk-string reply, or `null` when the key/field does not exist. */
    result: Guardian.string().nullable(),
  }).describe({
    title: 'String result',
    description:
      'UpstashRedis success envelope for GET/HGET: a single bulk string, or null when the key/field does not exist.',
  });
