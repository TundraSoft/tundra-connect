import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link ErrorSchemaObject}.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof _internal>`)
 * so the exported schema below can carry an explicit `BaseGuardian<T>`
 * annotation directly — JSR's slow-types check needs the originating
 * declaration of any type reachable from the public API to be explicit.
 */
export type ErrorSchema = {
  /**
   * Raw Redis/Upstash error message, e.g. `"ERR wrong number of arguments
   * for 'get' command"` or `"WRONGPASS invalid password"`.
   */
  error: string;
};

/**
 * Schema for UpstashRedis's error envelope, returned on HTTP `400` for both
 * a malformed request and a failed Redis command — Upstash's REST API does
 * not distinguish the two at the HTTP layer, so this connect doesn't
 * either; see {@link UpstashRedisErrorCodes.COMMAND_ERROR}.
 *
 * @example
 * ```typescript
 * import { ErrorSchemaObject } from '@tundraconnect/upstash-redis/schemas';
 *
 * const [error, body] = ErrorSchemaObject.safeParse({
 *   error: "ERR wrong number of arguments for 'get' command",
 * });
 * ```
 */
export const ErrorSchemaObject: BaseGuardian<ErrorSchema> = Guardian.object({
  /** Raw Redis/Upstash error message. */
  error: Guardian.string(),
}).describe({
  title: 'UpstashRedis error envelope',
  description:
    'The `{"error": "..."}` body UpstashRedis returns on HTTP 400, for both malformed requests and failed Redis commands.',
});
