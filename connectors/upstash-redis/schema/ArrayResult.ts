import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link ArrayResultSchemaObject}.
 *
 * Hand-written directly (no `GuardianInfer<typeof _internal>` hop) — see
 * {@link ErrorSchema} for the full reasoning.
 */
export type ArrayResultSchema = {
  /** The list of bulk-string replies. */
  result: (string | null)[];
};

/**
 * Schema for UpstashRedis's success envelope for a command that returns a
 * list of bulk strings — `LRANGE`.
 *
 * @example
 * ```typescript
 * import { ArrayResultSchemaObject } from '@tundraconnect/upstash-redis/schemas';
 *
 * const [error, body] = ArrayResultSchemaObject.safeParse({ result: ['a', 'b'] });
 * ```
 */
export const ArrayResultSchemaObject: BaseGuardian<ArrayResultSchema> = Guardian
  .object({
    /** The list of bulk-string replies. */
    result: Guardian.array(Guardian.string().nullable()),
  }).describe({
    title: 'Array result',
    description:
      'UpstashRedis success envelope for a command that returns a list of bulk strings (LRANGE).',
  });
