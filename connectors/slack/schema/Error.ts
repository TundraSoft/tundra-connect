import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Schema for Slack's universal `{ ok, error, warning }` response envelope.
 *
 * Slack's defining API convention: almost every documented failure arrives
 * as HTTP `200 OK` with `{ ok: false, error: '<short_error_code>' }` in the
 * body, not a 4xx/5xx status — so {@link Slack}'s response handler parses
 * this envelope on every response, not just ones with an error status. See
 * `Slack.ts`'s `__toError` for the full mapping.
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived) for the
 * same JSR "slow types" reason documented on
 * `connectors/slack/schema/Message.ts`'s `MessageSchema`.
 *
 * @example
 * ```typescript
 * import { ErrorEnvelopeSchemaObject } from '@tundraconnect/slack/schemas';
 *
 * const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
 *   ok: false,
 *   error: 'channel_not_found',
 * });
 * if (!error) {
 *   console.log(envelope.error);
 * }
 * ```
 */
export type ErrorEnvelopeSchema = {
  /** Whether the request succeeded. */
  ok: boolean;
  /** Slack's short, stable error code (e.g. `'channel_not_found'`), present when `ok` is `false`. */
  error?: string;
  /** A non-fatal warning Slack attached to an otherwise successful response (e.g. `'missing_charset'`). */
  warning?: string;
};

/** Slack's universal `{ ok, error, warning }` response envelope. */
export const ErrorEnvelopeSchemaObject: BaseGuardian<ErrorEnvelopeSchema> =
  Guardian.object({
    ok: Guardian.boolean(),
    error: Guardian.string().optional(),
    warning: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'Slack response envelope',
    description:
      "Slack's universal `{ ok, error, warning }` wrapper — `error` is present when `ok` is `false`.",
  });
