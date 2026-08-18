import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link StatusResultSchemaObject}.
 *
 * Hand-written directly (no `GuardianInfer<typeof _internal>` hop) — see
 * {@link ErrorSchema} for the full reasoning.
 */
export type StatusResultSchema = {
  /**
   * `"OK"` on a normal SET. `null` when a conditional SET (`NX`/`XX`) did
   * not apply because its condition wasn't met — this is not an error.
   */
  result: 'OK' | null;
};

/**
 * Schema for UpstashRedis's success envelope for `SET`.
 *
 * @example
 * ```typescript
 * import { StatusResultSchemaObject } from '@tundraconnect/upstash-redis/schemas';
 *
 * const [error, body] = StatusResultSchemaObject.safeParse({ result: 'OK' });
 * ```
 */
export const StatusResultSchemaObject: BaseGuardian<StatusResultSchema> =
  Guardian.object({
    /**
     * `"OK"` on a normal SET. `null` when a conditional SET (`NX`/`XX`) did
     * not apply because its condition wasn't met.
     */
    result: Guardian.literal('OK').nullable(),
  }).describe({
    title: 'Status result',
    description:
      'UpstashRedis success envelope for SET: "OK" on success, or null when a conditional SET (NX/XX) did not apply.',
  });
