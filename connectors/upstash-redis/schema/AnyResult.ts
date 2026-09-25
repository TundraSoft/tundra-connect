import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link AnyResultSchemaObject}.
 *
 * Hand-written directly (no `GuardianInfer<typeof _internal>` hop) — see
 * {@link ErrorSchema} for the full reasoning.
 */
export type AnyResultSchema = {
  /**
   * The command's reply, untyped. Optional at the type level (rather than
   * `result: unknown`) purely because `ObjectGuardian`'s inference marks
   * any `Guardian.unknown()`-guarded field optional (since `unknown`
   * already subsumes `undefined`) — the wire response always includes the
   * key.
   */
  result?: unknown;
};

/**
 * Schema for UpstashRedis's success envelope for a raw, low-level command
 * whose result shape this connect does not model — see
 * {@link UpstashRedis.execute}.
 *
 * @example
 * ```typescript
 * import { AnyResultSchemaObject } from '@tundraconnect/upstash-redis/schemas';
 *
 * const [error, body] = AnyResultSchemaObject.safeParse({ result: ['nested', 1] });
 * ```
 */
export const AnyResultSchemaObject: BaseGuardian<AnyResultSchema> = Guardian
  .object({
    /** The command's reply, untyped. `Guardian.unknown()` rejects `null`/
     * `undefined` by default, so this is explicitly `.nullable()` — a raw
     * command's reply (e.g. `GET` on a missing key) is routinely `null`. */
    result: Guardian.unknown().nullable(),
  }).describe({
    title: 'Untyped result',
    description:
      "UpstashRedis success envelope for a raw command whose result shape this connect doesn't model.",
  });
