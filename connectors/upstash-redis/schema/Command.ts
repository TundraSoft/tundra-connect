import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link CommandSchemaObject}.
 *
 * Hand-written directly (no `GuardianInfer<typeof _internal>` hop) so the
 * exported schema below can carry an explicit `BaseGuardian<T>` annotation —
 * see {@link ErrorSchema} for the full reasoning.
 */
export type CommandSchema = (string | number)[];

/**
 * Schema for a single Redis command in Upstash's JSON-body-array request
 * form — the entire POST body is the array itself, e.g.
 * `["SET", "foo", "bar", "EX", 100]`, not an object wrapping it.
 *
 * Upstash documents this array style as the general/preferred request
 * shape (over an alternative path-style URL form) precisely because it has
 * no ambiguity around URL-encoding special characters or binary-looking
 * values — every {@link UpstashRedis} endpoint method builds one of these
 * and sends it as-is to `POST /`, or several of them to `POST /pipeline`
 * (see {@link PipelineRequestSchema}).
 *
 * @example
 * ```typescript
 * import { CommandSchemaObject } from '@tundraconnect/upstash-redis/schemas';
 *
 * const [error, command] = CommandSchemaObject.safeParse(['SET', 'foo', 'bar', 'EX', 100]);
 * ```
 */
export const CommandSchemaObject: BaseGuardian<CommandSchema> = Guardian
  .array(
    // Deliberately NOT `Guardian.oneOf([Guardian.string(), Guardian.number()], ...)`
    // — both `StringGuardian` and `NumberGuardian` coerce by default
    // (`Guardian.string().parse(100) === '100'`), and `oneOf` tries its
    // members in order, so a `oneOf([string, number])` element guard
    // would silently stringify every number in the command array (and
    // `NumberGuardian` separately coerces booleans, which must be
    // rejected here, not turned into `0`/`1`). `Guardian.unknown()` with
    // a plain type-predicate `.refine()` performs no coercion at all, so
    // a number stays a number on the wire — required for e.g. `SET`'s
    // `EX`/`PX` arguments and Upstash's own documented examples.
    Guardian.unknown<string | number>().refine(
      (element) => typeof element === 'string' || typeof element === 'number',
      'Each command element must be a string or number',
    ),
  )
  .nonEmpty('A command array must include at least the command name')
  .refine(
    (cmd) => typeof cmd[0] === 'string' && cmd[0].trim().length > 0,
    'The first element of a command array must be a non-empty command name',
  )
  .describe({
    title: 'Redis command array',
    description:
      "One Redis command as Upstash's JSON array wire format: the command name followed by its arguments.",
  });
