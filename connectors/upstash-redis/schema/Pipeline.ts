import { type BaseGuardian, Guardian } from '@guardian';
import { CommandSchemaObject } from './Command.ts';

/**
 * Type definition for {@link PipelineRequestSchemaObject}.
 *
 * Hand-written directly (no `GuardianInfer<typeof _internal>` hop) — see
 * {@link ErrorSchema} in `./Error.ts` for the full reasoning.
 */
export type PipelineRequestSchema = (string | number)[][];

/**
 * Schema for the body of `POST /pipeline`: an array of {@link CommandSchema}
 * arrays, executed in order but **not atomically** — see
 * {@link UpstashRedis.pipeline}.
 *
 * @example
 * ```typescript
 * import { PipelineRequestSchemaObject } from '@tundraconnect/upstash-redis/schemas';
 *
 * const [error, body] = PipelineRequestSchemaObject.safeParse([
 *   ['SET', 'foo', 'bar'],
 *   ['GET', 'foo'],
 * ]);
 * ```
 */
export const PipelineRequestSchemaObject: BaseGuardian<
  PipelineRequestSchema
> = Guardian.array(CommandSchemaObject).nonEmpty(
  'A pipeline must include at least one command',
).describe({
  title: 'Pipeline request',
  description:
    'Body for POST /pipeline: an array of command arrays, executed in order but not atomically.',
});

/**
 * Type definition for {@link PipelineResultSchemaObject}.
 *
 * Hand-written directly (no `GuardianInfer<typeof _internal>` hop) — see
 * {@link ErrorSchema} in `./Error.ts` for the full reasoning.
 */
export type PipelineResultSchema =
  // `result` is optional at the type level (rather than `result: unknown`)
  // purely because `ObjectGuardian`'s inference marks any
  // `Guardian.unknown()`-guarded field optional (since `unknown` already
  // subsumes `undefined`) — the wire response always includes the key.
  | { result?: unknown }
  | { error: string };

/**
 * Schema for a single entry of a `/pipeline` response — independently
 * either a success (`{result}`) or a failure (`{error}`), regardless of
 * whether other entries in the same pipeline succeeded.
 *
 * @example
 * ```typescript
 * import { PipelineResultSchemaObject } from '@tundraconnect/upstash-redis/schemas';
 *
 * const [error, entry] = PipelineResultSchemaObject.safeParse({ error: 'ERR ...' });
 * ```
 */
export const PipelineResultSchemaObject: BaseGuardian<PipelineResultSchema> =
  Guardian.oneOf(
    [
      // `Guardian.unknown()` rejects `null`/`undefined` by default, so this
      // is explicitly `.nullable()` — an individual pipelined command's
      // reply (e.g. `GET` on a missing key) is routinely `null`.
      Guardian.object({ result: Guardian.unknown().nullable() }),
      Guardian.object({ error: Guardian.string() }),
    ],
    'Each pipeline entry must be a {result} or {error} object',
  );

/**
 * Type definition for {@link PipelineResponseSchemaObject}.
 *
 * Hand-written directly (no `GuardianInfer<typeof _internal>` hop) — see
 * {@link ErrorSchema} in `./Error.ts` for the full reasoning.
 */
export type PipelineResponseSchema = PipelineResultSchema[];

/**
 * Schema for the body of a `/pipeline` response: one {@link
 * PipelineResultSchema} entry per submitted command, **in the same order**,
 * each independently successful or failed.
 *
 * @example
 * ```typescript
 * import { PipelineResponseSchemaObject } from '@tundraconnect/upstash-redis/schemas';
 *
 * const [error, body] = PipelineResponseSchemaObject.safeParse([
 *   { result: 'OK' },
 *   { error: "ERR wrong number of arguments for 'get' command" },
 * ]);
 * ```
 */
export const PipelineResponseSchemaObject: BaseGuardian<
  PipelineResponseSchema
> = Guardian.array(PipelineResultSchemaObject).describe({
  title: 'Pipeline response',
  description:
    'Body of a /pipeline response: one {result}/{error} entry per submitted command, in the same order, independently successful or failed.',
});
